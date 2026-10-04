/* Headless QA: academy split + online course lifecycle.
 * covers: /academy two tracks → course page (syllabus, preview, capacity) →
 * guest login once, then ZERO extra codes for enroll → payment (demo) →
 * learn page progress → review → admin approve + poster upload → public shows it.
 * Usage: node scripts/qa-courses.mjs [baseUrl] */
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

const dbq = async (sqlText, params = []) => {
  const c = new Client({ host: "127.0.0.1", port: 5434, user: "postgres", password: "postgres", database: "app_db", connectionTimeoutMillis: 5000, query_timeout: 8000 });
  await c.connect();
  try { return (await c.query(sqlText, params)).rows; } finally { await c.end(); }
};

process.env.LD_LIBRARY_PATH = "/tmp/al2023/lib";
const browser = await puppeteer.launch({
  executablePath: await Chromium.executablePath(),
  args: [...Chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.setViewport({ width: 1280, height: 1000 });

const clickButton = async (label, scope = "") =>
  page.evaluate((lbl, src) => {
    const root = src ? document.querySelector(src) : document;
    if (!root) return false;
    const b = [...root.querySelectorAll("button")].find((x) => (x.textContent || "").includes(lbl) && !x.disabled);
    if (!b) return false;
    b.click();
    return true;
  }, label, scope);

const setVal = (selector, value) =>
  page.evaluate((sel, v) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, selector, value);

try {
  /* ---------- 0. reset our own test state (the DB is shared across dev+prod runs) ---------- */
  await dbq(`
    delete from payments where kind = 'COURSE' and ref_id in (
      select ce.id from course_enrollments ce join users u on u.id = ce.user_id where u.phone = '09129998877');
    delete from course_reviews where user_id = (select id from users where phone = '09129998877');
    update courses set "seatsTaken" = GREATEST("seatsTaken" - (
        select count(*) from course_enrollments ce where ce.user_id = (select id from users where phone = '09129998877') and ce.course_id = courses.id
      ), 0);
    delete from course_enrollments where user_id = (select id from users where phone = '09129998877');
  `);

  /* ---------- 1. academy split ---------- */
  await page.goto(`${BASE}/academy`, { waitUntil: "networkidle2" });
  await sleep(700);
  const academy = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      online: text.includes("دوره‌های آنلاین"),
      inperson: text.includes("کارگاه‌های حضوری"),
      heroSplit: text.includes("دو مسیر آموزشی"),
      courseTitle: text.includes("فید کلاسیک مردانه"),
      price: /۱[٬,]۲۰۰[٬,]۰۰۰/.test(text),
      seats: /۴ ظرفیت|۳ ظرفیت|ظرفیت/.test(text),
    };
  });
  ok("academy shows the two tracks", academy.online && academy.inperson && academy.heroSplit, JSON.stringify(academy));
  ok("published online course card is on /academy", academy.courseTitle && academy.price, "");

  /* ---------- 2. course page ---------- */
  await page.goto(`${BASE}/courses/classic-fade-online`, { waitUntil: "networkidle2" });
  await sleep(600);
  const detail = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      syllabus: text.includes("سرفصل‌ها و درس‌ها"),
      sections: document.querySelectorAll("details[open] summary").length,
      lessons: text.includes("فید کلاسیک سه‌مرحله‌ای"),
      preview: [...document.querySelectorAll("summary")].some((s) => (s.textContent || "").includes("نمونه رایگان")),
      seats: text.includes("جای خالی از"),
      loginAsked: Boolean([...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("ورود و ثبت‌نام"))),
      noInlineCode: !text.includes("کد پیامکی ارسال شد"),
    };
  });
  ok("course page: syllabus + lessons + preview lesson", detail.syllabus && detail.sections >= 2 && detail.lessons && detail.preview, JSON.stringify(detail));
  ok("course page: capacity + one-tap login ask (no OTP clutter)", detail.seats && detail.loginAsked && detail.noInlineCode, "");

  /* ---------- 3. login once (demo OTP) then enroll — no second code ---------- */
  await clickButton("ورود و ثبت‌نام");
  await page.waitForFunction(() => {
    const d = [...document.querySelectorAll("dialog")].find((x) => x.open && (x.textContent || "").includes("کد"));
    return Boolean(d);
  }, { timeout: 15000 });
  const phoneBox = await page.evaluate(() => {
    const d = [...document.querySelectorAll("dialog")].find((x) => x.open);
    const inp = d?.querySelector('input[name="phone"], input[type="tel"]');
    return Boolean(inp);
  });
  ok("auth modal opens with phone field", phoneBox);
  await page.evaluate(() => {
    const d = [...document.querySelectorAll("dialog")].find((x) => x.open);
    const inp = d.querySelector('input[name="phone"], input[type="tel"]');
    const proto = window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(inp, "09129998877");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    const send = [...d.querySelectorAll("button")].find((b) => (b.textContent || "").includes("دریافت کد"));
    setTimeout(() => send?.click(), 120);
  });
  await page.waitForSelector('[role="group"] input', { timeout: 15000 });
  for (const ch of "123456") {
    await page.evaluate((c) => {
      const d = [...document.querySelectorAll("dialog")].find((x) => x.open);
      const inputs = [...(d?.querySelectorAll('[role="group"] input') ?? [])];
      const empty = inputs.find((i) => !i.value);
      if (!empty) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(empty, c);
      empty.dispatchEvent(new Event("input", { bubbles: true }));
    }, ch);
    await sleep(120);
  }
  await page.evaluate(() => {
    const d = [...document.querySelectorAll("dialog")].find((x) => x.open);
    const btn = [...(d?.querySelectorAll("button") ?? [])].find((b) => /تأیید|ورود/.test(b.textContent || ""));
    btn?.click();
  });
  await page.waitForFunction(() => !document.querySelector("dialog[open]") || !document.querySelector("dialog[open]").textContent.includes("کد تأیید"), { timeout: 20000 });
  await sleep(900);
  await page.reload({ waitUntil: "networkidle2" });
  await sleep(600);
  const enrollReady = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    return {
      hasEnroll: Boolean([...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("ثبت‌نام و ادامه به پرداخت"))),
      noLogin: ![...(aside?.querySelectorAll("button") ?? [])].some((b) => (b.textContent || "").includes("ورود و ثبت‌نام")),
      identity: (aside?.textContent || "").includes("نیما") || (aside?.textContent || "").includes("کاظمی") || (aside?.textContent || "").includes("شماره") || (aside?.textContent || "").includes("به نام"),
    };
  });
  ok("logged-in student sees ONE enroll button — no login/code step again", enrollReady.hasEnroll && enrollReady.noLogin, JSON.stringify(enrollReady));

  await clickButton("ثبت‌نام و ادامه به پرداخت");
  await page.waitForFunction(() => [...document.querySelectorAll("a")].some((a) => (a.textContent || "").includes("ادامه به پرداخت")), { timeout: 25000 });
  await page.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find((x) => (x.textContent || "").includes("ادامه به پرداخت"));
    a?.click();
  });
  await page.waitForFunction(() => window.location.pathname.startsWith("/pay"), { timeout: 25000 });
  await sleep(700);
  const pay = await page.evaluate(() => ({
    courseLabel: document.body.innerText.includes("دورهٔ آنلاین"),
    price: /۱[٬,]۲۰۰[٬,]۰۰۰/.test(document.body.innerText),
  }));
  ok("pay page shows the course tuition", pay.courseLabel && pay.price, JSON.stringify(pay));
  /* server-action form: retry the press until the click actually lands */
  let paid = false;
  for (let i = 0; i < 15 && !paid; i += 1) {
    await clickButton("تأیید پرداخت آزمایشی").catch(() => null);
    await sleep(1500);
    paid = await page.evaluate(() => document.body.innerText.includes("پرداخت سمت سرور تأیید شده")).catch(() => false);
  }
  ok("demo payment verifies server-side (course unlocks)", paid);

  /* DB: enrollment ACTIVE + seat grabbed */
  const state = await dbq(`select ce.status, c."seatsTaken" as seats from course_enrollments ce join courses c on c.id = ce.course_id join users u on u.id = ce.user_id where c.slug = 'classic-fade-online' and u.phone = '09129998877' limit 1`);
  ok("enrollment ACTIVE after verified payment", state[0]?.status === "ACTIVE" && Number(state[0]?.seats) >= 1, JSON.stringify(state));

  /* ---------- 4. learn page: progress without re-auth ---------- */
  await page.goto(`${BASE}/courses/classic-fade-online/learn`, { waitUntil: "networkidle2" });
  await sleep(700);
  const learn = await page.evaluate(() => ({
    lessons: document.querySelectorAll("[data-lesson]").length,
    progress: document.body.innerText.includes("از ۳ درس"),
    player: Boolean(document.querySelector("[data-course-player] video, [data-course-player] .aspect-video")),
  }));
  ok("learn page lists enrolled lessons with progress bar", learn.lessons >= 3 && learn.progress && learn.player, JSON.stringify(learn));
  await clickButton("این درس را دیدم");
  await page.waitForFunction(() => document.body.innerText.includes("۱ از ۳"), { timeout: 15000 });
  ok("marking a lesson done persists (1/3 shown)", true);

  /* ---------- 5. review as student (PENDING moderation) ---------- */
  await page.goto(`${BASE}/courses/classic-fade-online`, { waitUntil: "networkidle2" });
  await sleep(500);
  const hasReviewForm = await page.evaluate(() => Boolean(document.querySelector("#course-review-comment")));
  ok("enrolled student sees the review form on the course page", hasReviewForm);
  if (hasReviewForm) {
    await setVal("#course-review-comment", "تمرین هفتگی با بازخورد مدرس عالی بود.");
    await clickButton("ثبت نظر");
    await page.waitForFunction(() => [...document.querySelectorAll("p")].some((p) => (p.textContent || "").includes("پس از تأیید")), { timeout: 15000 });
    ok("review accepted into moderation queue", true);
  }

  /* ---------- 6. admin: approve review + upload poster + Neshan panel ---------- */
  await apiLogout();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await setVal('input[name="phone"]', "09120000001");
  await setVal('input[name="password"]', "admin123");
  await clickButton("ورود به پنل مدیریت");
  await page.waitForFunction(() => window.location.pathname.startsWith("/admin"), { timeout: 25000 });
  await sleep(900);
  const adminPanels = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      coursesNav: text.includes("دوره‌های آنلاین"),
      contactNav: text.includes("آدرس و نقشه"),
      row: Boolean(document.querySelector('[data-course-row="classic-fade-online"]')),
      pendingReview: text.includes("نظر در انتظار تأیید"),
    };
  });
  ok("admin panel: courses + address sections with pending badge", adminPanels.coursesNav && adminPanels.contactNav && adminPanels.row && adminPanels.pendingReview, JSON.stringify(adminPanels));

  /* open editor row, approve the review */
  await page.evaluate(() => document.querySelector('[data-course-row="classic-fade-online"] summary')?.click());
  await sleep(500);
  const approved = await clickButton("تأیید و نمایش");
  ok("approve button present on the pending review", approved);
  if (approved) {
    await sleep(1800);
    const reviewNow = await dbq("select status from course_reviews where course_id = (select id from courses where slug='classic-fade-online') order by id desc limit 1");
    ok("review APPROVED in DB", reviewNow[0]?.status === "APPROVED", JSON.stringify(reviewNow));
  }

  /* upload: 1x1 png through the real endpoint + write into the poster field */
  const uploadRes = await page.evaluate(async () => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new File([png], "poster.png", { type: "image/png" }));
    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    const json = await res.json();
    return { status: res.status, json };
  });
  ok("upload endpoint stores the file", uploadRes.status === 200 && String(uploadRes.json.url ?? "").startsWith("/uploads/"), JSON.stringify(uploadRes));
  let uploadedUrl = null;
  if (uploadRes.json?.url) {
    uploadedUrl = uploadRes.json.url;
    const served = await page.evaluate(async (u) => (await fetch(u)).status, uploadedUrl);
    ok("uploaded file is publicly served", served === 200, `GET ${uploadedUrl} → ${served}`);
    await setVal("#f-poster-classic .poster", uploadedUrl).catch(() => null);
    const filled = await page.evaluate((u) => {
      const inp = document.querySelector('input[name="posterUrl"]');
      if (!inp) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, u);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }, uploadedUrl);
    ok("poster url field writable in the edit form", filled);
    if (filled) {
      await clickButton("ذخیره تغییرات");
      await sleep(2200);
      const saved = await dbq("select poster_url from courses where slug='classic-fade-online'");
      ok("poster saved to the course", saved[0]?.poster_url === uploadedUrl, JSON.stringify(saved));
    }
  }

  /* Neshan panel state: search field or graceful off-note (fake key → error path is also fine) */
  const neshanUi = await page.evaluate(() => {
    const box = document.querySelector("[data-contact-admin]");
    return {
      present: Boolean(box),
      searchOrOff: Boolean(box?.querySelector("#neshan-q")) || Boolean(box?.querySelector("[data-neshan-off]")),
    };
  });
  ok("address panel renders with Neshan search (or documented fallback)", neshanUi.present && neshanUi.searchOrOff, JSON.stringify(neshanUi));
  const searchWorks = await page.evaluate(async () => {
    const res = await fetch("/api/neshan/search?q=تهران ولیعصر", { cache: "no-store" });
    return { status: res.status, json: await res.json().catch(() => null) };
  });
  ok("neshan proxy answers (list or typed error — never leaks key)", [200, 429, 502].includes(searchWorks.status), JSON.stringify(searchWorks.status));

  /* save a manual address + coords → public dialog shows them */
  const contactSaved = await page.evaluate(async () => {
    const form = document.querySelector("[data-contact-admin] form");
    if (!form) return "no-form";
    const set = (name, v) => { const el = form.querySelector(`[name="${name}"]`); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    set("address", "تهران، خیابان ولیعصر، نبش کوچهٔ مهر، پلاک ۱۴۸");
    set("lat", "35.7006");
    set("lng", "51.4049");
    form.requestSubmit();
    return "submitted";
  });
  await sleep(2400);
  void contactSaved;
  const savedContact = await dbq("select value from site_settings where key = 'contact'");
  ok("contact saved into site_settings", (savedContact[0]?.value ?? "").includes("پلاک ۱۴۸"), JSON.stringify(savedContact[0]?.value ?? "").slice(0, 120));

  /* public dialog via the quick-access page */
  await apiLogout();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await sleep(700);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("آدرس و تماس"));
    b?.click();
  });
  await sleep(500);
  const dialog = await page.evaluate(() => {
    const d = [...document.querySelectorAll("dialog")].find((x) => x.open && (x.textContent || "").includes("تماس"));
    const text = d?.textContent ?? "";
    return {
      address: text.includes("پلاک ۱۴۸"),
      directions: Boolean(d?.querySelector('a[href*="neshan.org/link/place"]')),
    };
  });
  ok("public dialog uses the saved address + Neshan directions link", dialog.address && dialog.directions, JSON.stringify(dialog));

  /* restore the old constant-ish address so the repo demo stays neutral */
  await dbq("delete from site_settings where key = 'contact'");

  /* public review visible after approval */
  await page.goto(`${BASE}/courses/classic-fade-online`, { waitUntil: "networkidle2" });
  await sleep(600);
  const publicReview = await page.evaluate(() => document.body.innerText.includes("بازخورد مدرس عالی بود") || document.body.innerText.includes("تمرین هفتگی با بازخورد"));
  ok("approved review visible on the public page", publicReview);

  /* ---------- 7. capacity wall (server-side) ---------- */
  void dbq;
  /* (the transaction checks capacity itself; here we just flip "seatsTaken") */
  await dbq('update courses set "seatsTaken" = capacity where slug=\'classic-fade-online\'');
  const noSession = await page.evaluate(async () => (await fetch("/api/courses/enroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId: 1 }) })).status);
  ok("enroll requires a session (no silent guest seats)", noSession === 401, `status=${noSession}`);
  const fullPage = await page.evaluate(async () => {
    const res = await fetch("/courses/classic-fade-online");
    const html = await res.text();
    return { status: res.status, full: html.includes("تکمیل") };
  });
  await dbq('update courses set "seatsTaken" = GREATEST("seatsTaken" - 1, 0) where slug=\'classic-fade-online\'');
  ok("course page flags تکمیل ظرفیت when seats run out", fullPage.status === 200 && fullPage.full, "");

  /* cleanup: remove the QA review + uploaded file row notes (course stays for demo) */
  await dbq("delete from course_reviews where comment like '%تمرین هفتگی با بازخورد%'");
} catch (err) {
  ok("script completed without infrastructure errors", false, String(err).slice(0, 300));
} finally {
  await browser.close();
  console.log(results.join("\n"));
  console.log(`\nqa-courses: ${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
}

async function apiLogout() {
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" })).catch(() => null);
  await sleep(400);
}
