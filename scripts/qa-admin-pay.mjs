/* Headless QA: admin skill-approval (server-authoritative) and the pay-verify flow.
 * Usage: node scripts/qa-admin-pay.mjs [baseUrl]   (needs a production `next start`) */
import Chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const BASE = process.argv[2] ?? "http://127.0.0.1:5001";
const results = [];
let failures = 0;
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dbq = async (sqlText) => {
  const c = new Client({ host: "127.0.0.1", port: 5434, user: "postgres", password: "postgres", database: "app_db", connectionTimeoutMillis: 5000, query_timeout: 8000 });
  await c.connect();
  try { return (await c.query(sqlText)).rows; } finally { await c.end(); }
};

process.env.LD_LIBRARY_PATH = "/tmp/al2023/lib";
const browser = await puppeteer.launch({
  executablePath: await Chromium.executablePath(),
  args: [...Chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
process.env.LD_LIBRARY_PATH = "/tmp/al2023/lib";

const clickWhere = async (page, pred, scope = "") =>
  page.evaluate((src, predSrc) => {
    const root = src ? document.querySelector(src) : document;
    if (!root) return false;
    const fn = new Function(`return (${predSrc})`)();
    const btn = [...root.querySelectorAll("button")].find((b) => fn(b));
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }, scope, pred);

async function waitClick(page, pred, scope = "", tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    if (await clickWhere(page, pred, scope)) return true;
    await sleep(300);
  }
  return false;
}

try {
  /* ================= PART 1 — admin approves a PENDING skill ================= */
  const before = await dbq("select bs.id as membership_id, bs.status from barber_skills bs join skills sk on sk.id=bs.skill_id join barbers ba on ba.id=bs.barber_id where bs.status='PENDING' and sk.name='رنگ مو' and ba.name like '%سامان%' limit 1");
  ok("demo starts with سامان's colour skill PENDING", before.length === 1, JSON.stringify(before));

  const adminPage = await browser.newPage();
  adminPage.on("pageerror", (e) => console.log("[admin pageerror]", String(e).slice(0, 300)));
  await adminPage.setViewport({ width: 1280, height: 900 });
  await adminPage.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await adminPage.type('input[name="phone"]', "09120000001");
  await adminPage.type('input[name="password"]', "admin123");
  await Promise.all([
    adminPage.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => null),
    adminPage.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("ورود")); b?.click(); }),
  ]);
  await sleep(1500);
  const onAdmin = adminPage.url().includes("/admin");
  ok("staff login lands on /admin", onAdmin, adminPage.url());

  const skillsPanel = await adminPage.evaluate(() => document.body.innerText.includes("ادعای مهارت «رنگ مو»"));
  ok("skills queue shows the pending claim", skillsPanel);

  const clicked = await waitClick(adminPage, 'b => (b.textContent||"").trim()==="تأیید" && b.closest("form")');
  ok("approve button clicked", clicked);
  await sleep(2500);
  const after = await dbq("select bs.status from barber_skills bs join skills sk on sk.id=bs.skill_id join barbers ba on ba.id=bs.barber_id where sk.name='رنگ مو' and ba.name like '%سامان%' limit 1");
  ok("DB flipped to APPROVED (server-side effect)", after[0]?.status === "APPROVED", JSON.stringify(after));
  await adminPage.reload({ waitUntil: "networkidle2" });
  await sleep(1000);
  const queueGone = await adminPage.evaluate(() => !document.body.innerText.includes("ادعای مهارت «رنگ مو»"));
  ok("queue empty on fresh server read", queueGone);

  /* full scenario: skill approved AND service enabled on his profile —
     the scheduler must then accept a pin to him (two gates, one flip each) */
  await dbq("insert into barber_services(barber_id, service_id) values (2,5) on conflict do nothing");
  const planResp = await adminPage.evaluate(async () => {
    const r = await fetch("/api/booking/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: "2026-10-17", startMin: null, attendees: [{ attendeeId: "a", attendeeName: "آزمون", serviceIds: [5], barberId: 2 }] }) });
    return r.json();
  });
  const schedulable = (planResp.validStarts ?? []).length > 0;
  const firstStart = planResp.validStarts?.[0];
  let pinnedPlan = null;
  if (firstStart !== undefined)
    pinnedPlan = await adminPage.evaluate(async (m) => {
      const r = await fetch("/api/booking/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: "2026-10-17", startMin: m, attendees: [{ attendeeId: "a", attendeeName: "آزمون", serviceIds: [5], barberId: 2 }] }) });
      return r.json();
    }, firstStart);
  ok("approved + enabled ⇒ schedulable at a real start (server data-driven)", pinnedPlan?.plan?.segments?.[0]?.barberName?.includes("سامان") === true, JSON.stringify(pinnedPlan?.plan?.segments?.[0]?.barberName ?? pinnedPlan?.issues ?? {}).slice(0, 160));

  /* sign the staff user out so PART 2 starts anonymous in the same browser */
  await adminPage.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
  await adminPage.close();

  /* restore demo state */
  await dbq("delete from barber_services where barber_id=2 and service_id=5");
  await dbq("update barber_skills set status='PENDING' where status='APPROVED' and skill_id=(select id from skills where name='رنگ مو' limit 1) and barber_id=(select id from barbers where name like '%سامان%' limit 1)");

  /* ================= PART 2 — customer pays (isolated ctx: no staff cookie leak) ================= */
  const clientPage = await browser.newPage();
  clientPage.on("pageerror", (e) => console.log("[client pageerror]", String(e).slice(0, 300)));
  await clientPage.setViewport({ width: 375, height: 812 });
  await clientPage.goto(`${BASE}/booking`, { waitUntil: "networkidle2" });
  const toggle = async (name) => {
    for (let i = 0; i < 40; i += 1) {
      const st = await clientPage.evaluate((n) => {
        const sw = [...document.querySelectorAll('[role="switch"]')].find((b) => (b.getAttribute("aria-label") || "") === `انتخاب ${n}`);
        return sw ? { on: sw.getAttribute("aria-checked") === "true", dis: sw.disabled } : null;
      }, name);
      if (st?.on) return true;
      if (st && !st.dis) await clientPage.evaluate((n) => { [...document.querySelectorAll('[role="switch"]')].find((b) => (b.getAttribute("aria-label") || "") === `انتخاب ${n}`)?.click(); }, name);
      await sleep(300);
    }
    return false;
  };
  ok("colour service toggled", await toggle("رنگ و لایت"));
  await waitClick(clientPage, 'b => (b.textContent||"").includes("انتخاب زمان")');
  /* pick the first day/time the API offers */
  let booked = false;
  for (let d = 0; d < 8 && !booked; d += 1) {
    const day = await clientPage.$$eval("button.bk-day", (els, i) => { if (els[i]) els[i].click(); return !!els[i]; }, d);
    if (!day) {
      /* try advancing the week */
      const adv = await waitClick(clientPage, 'b => b.getAttribute("aria-label")==="هفته بعد"', "", 3);
      if (!adv) break;
      d = -1;
      continue;
    }
    await sleep(900);
    booked = await clientPage.evaluate(() => {
      const t = document.querySelector("button.bk-time:not([disabled])");
      if (t) { t.click(); return true; }
      return false;
    });
    if (!booked) continue;
  }
  ok("a valid start for the colour visit was chosen", booked);
  await sleep(1600);
  await waitClick(clientPage, 'b => (b.textContent||"").includes("ورود / ساخت حساب و ادامه")', "", 40);
  try {
    await clientPage.waitForSelector('dialog input[placeholder="0912 345 6789"]', { visible: true });
  } catch (e) {
    console.log("[authdbg]", await clientPage.evaluate(() => ({ url: location.href, dialogs: [...document.querySelectorAll("dialog")].map((d) => ({ open: d.open, t: (d.innerText || "").slice(0, 80) })), body: document.body.innerText.slice(0, 300) })));
    throw e;
  }
  await clientPage.type('dialog input[placeholder="0912 345 6789"]', "09129998877");
  await waitClick(clientPage, 'b => (b.textContent||"").includes("دریافت کد")', "dialog");
  await clientPage.waitForSelector('dialog [role="group"][aria-label="شش رقم کد تأیید"] input', { visible: true });
  await clientPage.focus('dialog [role="group"][aria-label="شش رقم کد تأیید"] input');
  for (const ch of "123456") { await clientPage.keyboard.type(ch); await sleep(70); }
  await clientPage.evaluate(() => {
    const b = [...document.querySelectorAll("dialog button")].find((x) => /ورود خودکار|تأیید و ادامه/.test(x.textContent || "") && !x.disabled);
    b?.click();
  });
  /* policy sheet may appear for a session without recorded acceptance */
  await sleep(1500);
  await clientPage.evaluate(() => {
    const d = [...document.querySelectorAll("dialog")].find((x) => x.open && (x.textContent || "").includes("نکات مهم رزرو"));
    if (d) { d.querySelector('input[type="checkbox"]')?.click(); setTimeout(() => [...d.querySelectorAll("button")].find((b) => (b.textContent || "").includes("تأیید و ادامه"))?.click(), 120); }
  });
  /* commit → /pay because amountDueOnline > 0 */
  const payClicked = await waitClick(clientPage, 'b => (b.textContent||"").includes("ثبت و پرداخت")', "", 40);
  ok("commit button (ثبت و پرداخت) engaged", payClicked);
  await clientPage.waitForFunction(() => location.pathname.startsWith("/pay"), { timeout: 40000 });
  ok("wizard redirected to /pay for the online portion", true, clientPage.url().replace(BASE, ""));
  const amountShown = await clientPage.evaluate(() => document.body.innerText.includes("۱٬۲۰۰٬۰۰۰") || /1,200,000/.test(document.body.innerText));
  ok("pay page shows the server price for the visit", amountShown);

  const rowsBefore = await dbq("select a.id, a.status from appointments a where a.status='PENDING' order by a.id desc limit 1");
  ok("visit exists as PENDING awaiting payment", rowsBefore.length === 1, JSON.stringify(rowsBefore));
  const apptId = rowsBefore[0].id;

  await waitClick(clientPage, 'b => (b.textContent||"").includes("تأیید پرداخت آزمایشی")');
  await sleep(2500);
  const confirmTxt = await clientPage.evaluate(() => document.body.innerText.includes("قطعی هستند"));
  ok("server-verified payment flips the copy to confirmed", confirmTxt);
  const after2 = await dbq(`select status from appointments where id=${apptId}`);
  ok("DB status is CONFIRMED after server-side verification", after2[0]?.status === "CONFIRMED", JSON.stringify(after2));
  const payRow = await dbq(`select p.status from payments p where p.ref_id=${apptId} and p.kind='APPOINTMENT_GROUP' or p.ref_id=${apptId} and p.kind='APPOINTMENT' limit 1`);
  ok("payment row marked PAID", payRow[0]?.status === "PAID", JSON.stringify(payRow));
} catch (error) {
  ok("run completed without timeout", false, String(error).slice(0, 250));
} finally {
  console.log(results.join("\n"));
  await browser.close();
  process.exit(failures ? 1 : 0);
}
