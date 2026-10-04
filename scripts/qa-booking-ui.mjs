/* Headless QA of the customer booking wizard (light theme, guest checkout flow)
 * against a running server. Usage: node scripts/qa-booking-ui.mjs [baseUrl]
 * Uses @sparticuz/chromium + puppeteer-core (installed with --no-save in this sandbox). */
import Chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:5000";
const results = [];
let failures = 0;
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures += 1;
};

process.env.LD_LIBRARY_PATH = `/tmp/al2023/lib${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""}`;
const browser = await puppeteer.launch({
  executablePath: await Chromium.executablePath(),
  args: [...Chromium.args, "--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  headless: true,
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("response", async (res) => {
  if (!res.url().includes("/api/")) return;
  let body = "";
  try { body = (await res.text()).slice(0, 180); } catch {}
  console.log(`[net ${res.status()}] ${res.url().replace(BASE, "")} ${body}`);
});
await page.setViewport({ width: 375, height: 812 });
page.setDefaultTimeout(30000);

const clickButton = async (text, scope = "") => {
  try {
    await page.waitForFunction(
      (t, s) => {
        const root = s ? document.querySelector(s) : document;
        if (!root) return false;
        const btn = [...root.querySelectorAll("button")].find((b) => ((b.textContent || "").includes(t) || (b.getAttribute("aria-label") || "").includes(t)) && !b.disabled);
        if (!btn) return false;
        btn.click();
        return true;
      },
      { timeout: 25000 },
      text,
      scope,
    );
  } catch (e) {
    const dump = await page.evaluate(() =>
      [...document.querySelectorAll("button")].map((b) => `${(b.textContent || "").trim().slice(0, 28)}|${b.disabled ? "off" : "on"}`).join(" ;; "),
    );
    console.log(`[clickfail] "${text}" scope="${scope}" buttons: ${dump.slice(0, 1500)}`);
    throw e;
  }
};
const typeInto = async (selector, value) => {
  await page.waitForSelector(selector, { visible: true });
  await page.evaluate((s, v) => {
    const el = document.querySelector(s);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, selector, value);
};
const switchState = (name) =>
  page.evaluate((n) => {
    const sw = [...document.querySelectorAll('[role="switch"]')].find((b) => (b.getAttribute("aria-label") || "") === `انتخاب ${n}`);
    return sw ? { on: sw.getAttribute("aria-checked") === "true", disabled: sw.disabled } : null;
  }, name);
const toggleSwitch = async (name) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const st = await switchState(name);
    if (st?.on) return true;
    if (st && !st.disabled)
      await page.evaluate((n) => {
        const sw = [...document.querySelectorAll('[role="switch"]')].find((b) => (b.getAttribute("aria-label") || "") === `انتخاب ${n}`);
        sw?.click();
      }, name);
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  /* ---------- 1. wizard loads, light theme like the rest of the site ---------- */
  await page.goto(`${BASE}/booking`, { waitUntil: "networkidle2" });
  const h1 = await page.$eval("h1", (e) => e.textContent).catch(() => "");
  ok("wizard step 0 renders", (h1 || "").includes("چه خدمتی"), `h1="${h1}"`);
  const theme = await page.evaluate(() => {
    const scoped = document.querySelector(".theme-customer");
    const cs = getComputedStyle(document.querySelector("h1"));
    const [r, g, b] = (cs.color.match(/\d+/g) ?? []).map(Number);
    return { scoped: Boolean(scoped), ink: r < 120 && g < 120 && b < 120 };
  });
  ok("customer surface is light — no dark island", theme.scoped === false && theme.ink === true, `scoped=${theme.scoped} ink=${theme.ink}`);

  /* wait until React has hydrated — toggles must actually change DOM state */
  ok("haircut toggle works after hydration", await toggleSwitch("اصلاح مو"));
  await sleep(400);

  /* ---------- 2. conflict AUTO-SWAP (both directions), with the salon's own note ---------- */
  const pkgBefore = await switchState("پکیج مو و ریش");
  ok("conflicting package is selectable, not blocked", pkgBefore?.disabled === false);
  ok("selecting package auto-drops haircut", (await toggleSwitch("پکیج مو و ریش")) && !(await switchState("اصلاح مو"))?.on);
  let swap = await page.evaluate(() => document.querySelector("[data-swap-note]")?.textContent ?? "");
  ok("swap note names the dropped service", swap.includes("اصلاح مو") && swap.includes("خارج شد"), swap.slice(0, 120));
  ok("reverse direction: haircut back auto-drops package", (await toggleSwitch("اصلاح مو")) && !(await switchState("پکیج مو و ریش"))?.on);
  swap = await page.evaluate(() => document.querySelector("[data-swap-note]")?.textContent ?? "");
  ok("swap note fires in reverse too", swap.includes("پکیج"), swap.slice(0, 120));

  /* ---------- 3. add beard → 75-minute continuous visit ---------- */
  ok("beard toggle works", await toggleSwitch("اصلاح و طراحی ریش"));
  await page.waitForFunction(() => [...document.querySelectorAll("p")].some((p) => p.textContent.includes("۲ خدمت · ۷۵ دقیقه")));
  ok("sticky summary shows 2 services / 75 min", true);
  await clickButton("انتخاب آرایشگر");

  /* ---------- 4. dedicated barber step BEFORE the time ---------- */
  await page.waitForFunction(() => Boolean(document.querySelector("[data-barber-card]")));
  const barberStep = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-barber-card]")];
    const any = document.querySelector('[data-barber-card="any"]');
    const real = cards.find((c) => c.getAttribute("data-barber-card") !== "any");
    return {
      count: cards.length,
      anyPressed: any?.getAttribute("aria-pressed") === "true",
      anyOn: any?.className.includes("bk-row-on"),
      realHasReason: Boolean(real?.textContent?.match(/انجام|یک نوبت|آرایشگر/)),
      h1: document.querySelector("h1")?.textContent ?? "",
    };
  });
  ok("barber step renders with eligibility reasons", barberStep.count >= 2 && barberStep.anyPressed && barberStep.realHasReason && barberStep.h1.includes("با چه آرایشگری"), `cards=${barberStep.count}`);
  await clickButton("انتخاب زمان");

  /* ---------- 5. time step: pick first day with a selectable time ---------- */
  await page.waitForSelector("button.bk-day");
  const dayCount = await page.$$eval("button.bk-day", (els) => els.length);
  let picked = false;
  for (let d = 0; d < dayCount && !picked; d += 1) {
    await page.$$eval("button.bk-day", (els, i) => els[i].click(), d);
    await sleep(700);
    picked = await page.evaluate(() => {
      const t = document.querySelector("button.bk-time:not([disabled])");
      if (t) { t.click(); return true; }
      return false;
    });
  }
  ok("date + single start time selected", picked);

  /* ---------- 6. review: plan + one visit + identity tabs ---------- */
  await page.waitForFunction(() => [...document.querySelectorAll("span")].some((s) => s.textContent.includes("یک نوبت · ۷۵ دقیقه")), { timeout: 25000 });
  ok("one continuous visit badge rendered on review", true);
  await sleep(900);
  const segBarbers = await page.$$eval(".bk-seg a[data-segment-barber]", (els) => els.map((e) => e.getAttribute("data-segment-barber")));
  ok("same-barber cluster honored live", segBarbers.length === 2 && segBarbers[0] === segBarbers[1], JSON.stringify(segBarbers));
  const segTimes = await page.$$eval(".bk-seg .font-mono", (els) => els.map((e) => e.textContent.trim()));
  const [aEnd] = (segTimes[0] || "").split("–")[1]?.split(" ") ?? [""];
  const [bStart] = (segTimes[1] || "").split("–") ?? [];
  ok("segments are back-to-back (no artificial gap)", (aEnd || "").trim() === (bStart || "").trim(), `${aEnd} vs ${bStart}`);
  const identity = await page.evaluate(() => {
    const tabs = document.querySelector("[data-checkout-tabs]");
    return {
      tabs: Boolean(tabs),
      guestSelected: document.querySelector('[data-checkout-tab="guest"]')?.getAttribute("aria-selected") === "true",
      loginSelected: document.querySelector('[data-checkout-tab="login"]')?.getAttribute("aria-selected") === "true",
      fields: Boolean(document.querySelector("#guest-name") && document.querySelector("#guest-phone")),
      total: [...document.querySelectorAll("p")].some((p) => (p.textContent || "").startsWith("مجموع: ")),
    };
  });
  ok("review asks identity LAST: guest tab + name/phone + total", identity.tabs && identity.guestSelected && !identity.loginSelected && identity.fields && identity.total, JSON.stringify(identity));

  /* ---------- 7. taken number → routed to the login tab (no duplicate registration) ---------- */
  await typeInto("#guest-name", "صحرای تست");
  await typeInto("#guest-phone", "09129998877");
  await clickButton("تأیید و ثبت نوبت", "").catch(() => clickButton("ثبت رزرو و پرداخت"));
  await page.waitForFunction(() => document.querySelector('[data-checkout-tab="login"]')?.getAttribute("aria-selected") === "true", { timeout: 20000 });
  const routed = await page.evaluate(() => ({
    err: document.querySelector("[data-tab-error]")?.textContent ?? "",
    phone: document.querySelector("#login-phone")?.value ?? "",
  }));
  ok("existing number routes to code login, never re-registers", routed.err.includes("قبلاً ثبت‌نام") && routed.phone === "09129998877", routed.err.slice(0, 100));

  /* ---------- 8. OTP in-tab → hold → commit ---------- */
  await clickButton("دریافت کد ورود", "");
  await page.waitForSelector('[role="group"][aria-label="شش رقم کد تأیید"] input');
  /* deterministic path: the demo-code chip fills and verifies in one click;
     typed digits race with controlled re-renders under headless load */
  const chipClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("کد دمو"));
    if (!b) return false;
    b.click();
    return true;
  });
  if (!chipClicked) {
    await page.focus('[role="group"][aria-label="شش رقم کد تأیید"] input');
    for (const ch of "123456") { await page.keyboard.type(ch); await sleep(200); }
  }
  await page.waitForFunction(
    () => [...document.querySelectorAll("*")].some((n) => n.textContent === "این زمان موقتاً برای کل نوبت شما نگه داشته شده است."),
    { timeout: 30000 },
  );
  ok("hold countdown covers the whole plan after login", true);
  await clickButton("تأیید و ثبت نوبت").catch(() => clickButton("ثبت رزرو و پرداخت"));
  await sleep(1200);
  await page.evaluate(() => {
    const dlgs = [...document.querySelectorAll("dialog")].filter((d) => d.open && (d.textContent || "").includes("نکات مهم رزرو"));
    for (const d of dlgs) {
      d.querySelector('input[type="checkbox"]')?.click();
      const b = [...d.querySelectorAll("button")].find((x) => (x.textContent || "").includes("تأیید و ادامه"));
      setTimeout(() => b?.click(), 150);
    }
  });
  await page.waitForFunction(() => [...document.querySelectorAll("h1,h2")].some((h) => h.textContent.includes("رزرو شما ثبت شد")), { timeout: 30000 });
  ok("confirmation step reached", true);
  const confirmText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  ok("single appointment receipt framing", confirmText.includes("نوبت") && !confirmText.includes("دو نوبت جدا"), "");

  /* ---------- 9. guest endpoint contract (auto-create once, never takeover) ---------- */
  const guestProbe = await page.evaluate(async () => {
    const phone = `0931${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const first = await fetch("/api/auth/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, name: "مهمان یکتا" }) }).then((r) => r.json());
    const second = await fetch("/api/auth/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, name: "کس دیگر" }) }).then((r) => r.json());
    await fetch("/api/auth/logout", { method: "POST" });
    return { phone, created: first.ok === true && first.existing === false && first.user?.name === "مهمان یکتا", protected: second.existing === true && !second.user };
  });
  ok("guest checkout auto-creates the account once and refuses takeover", guestProbe.created && guestProbe.protected, JSON.stringify(guestProbe).slice(0, 140));
} catch (error) {
  ok("run completed without timeout", false, String(error).slice(0, 200));
} finally {
  console.log(results.join("\n"));
  await browser.close();
  process.exit(failures ? 1 : 0);
}
