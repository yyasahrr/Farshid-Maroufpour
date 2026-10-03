/* Headless QA of the customer booking wizard (dark premium flow) against a running dev server.
 * Usage: node scripts/qa-booking-ui.mjs [baseUrl]
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

try {
  /* ---------- 1. wizard loads with the "one start time" promise ---------- */
  await page.goto(`${BASE}/booking`, { waitUntil: "networkidle2" });
  const h1 = await page.$eval("h1", (e) => e.textContent).catch(() => "");
  ok("wizard step 0 renders", (h1 || "").includes("چه خدمتی"), `h1="${h1}"`);
  const dark = await page.evaluate(() => {
    const el = document.querySelector(".theme-customer");
    return el ? getComputedStyle(el).backgroundColor : null;
  });
  ok("customer surface is dark premium", dark !== null && /rgba?\((1[0-9]|9|1[0-4]),/.test(dark), `bg=${dark}`);

  /* wait until React has hydrated — toggles must actually change DOM state */
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

  /* ---------- 2. forbidden pair blocked with the DB's own note ---------- */
  ok("haircut toggle works after hydration", await toggleSwitch("اصلاح مو"));
  await new Promise((r) => setTimeout(r, 400));
  const comboState = await page.evaluate(() => {
    const sw = [...document.querySelectorAll('[role="switch"]')].find((b) => (b.getAttribute("aria-label") || "").includes("پکیج مو و ریش"));
    return {
      disabled: sw ? sw.disabled : null,
      reason: [...document.querySelectorAll("p")].some((p) => p.textContent.includes("نیازی به رزرو جداگانه نیست")),
    };
  });
  ok("haircut+package switch disabled (server rule)", comboState.disabled === true);
  ok("forbidden reason is the salon policy text", comboState.reason === true);

  /* ---------- 3. add beard → 75-minute continuous visit ---------- */
  ok("beard toggle works", await toggleSwitch("اصلاح و طراحی ریش"));
  await page.waitForFunction(() => [...document.querySelectorAll("p")].some((p) => p.textContent.includes("۲ خدمت · ۷۵ دقیقه")));
  ok("sticky summary shows 2 services / 75 min", true);
  await clickButton("انتخاب زمان");

  /* pick first day with a selectable time */
  await page.waitForSelector("button.bk-day");
  const dayCount = await page.$$eval("button.bk-day", (els) => els.length);
  let picked = false;
  for (let d = 0; d < dayCount && !picked; d += 1) {
    await page.$$eval("button.bk-day", (els, i) => els[i].click(), d);
    await new Promise((r) => setTimeout(r, 700));
    picked = await page.evaluate(() => !!document.querySelector("button.bk-time:not([disabled])"));
    if (picked) await page.evaluate(() => document.querySelector("button.bk-time:not([disabled])").click());
  }
  ok("date + single start time selected", picked);

  /* step 2 — plan: one visit badge + same barber for the cluster */
  await page.waitForFunction(() => [...document.querySelectorAll("span")].some((s) => s.textContent.includes("یک نوبت · ۷۵ دقیقه")), { timeout: 25000 });
  ok("one continuous visit badge rendered", true);
  await new Promise((r) => setTimeout(r, 900));
  const segBarbers = await page.$$eval(".bk-seg a[data-segment-barber]", (els) => els.map((e) => e.getAttribute("data-segment-barber")));
  ok("same-barber cluster honored live", segBarbers.length === 2 && segBarbers[0] === segBarbers[1], JSON.stringify(segBarbers));
  const segTimes = await page.$$eval(".bk-seg .font-mono", (els) => els.map((e) => e.textContent.trim()));
  const [aEnd] = (segTimes[0] || "").split("–")[1]?.split(" ") ?? [""];
  const [bStart] = (segTimes[1] || "").split("–") ?? [];
  ok("segments are back-to-back (no artificial gap)", (aEnd || "").trim() === (bStart || "").trim(), `${aEnd} vs ${bStart}`);

  /* ---------- 4. login only now; hold covers the plan ---------- */
  await clickButton("ورود / ساخت حساب و ادامه");
  await page.waitForSelector('dialog input[placeholder="0912 345 6789"]');
  await typeInto('dialog input[placeholder="0912 345 6789"]', "09129998877");
  await clickButton("دریافت کد", "dialog");
  // demo mode: either six separate boxes, or one-click auto-login
  await page.waitForFunction(() => document.querySelector('dialog [role="group"][aria-label="شش رقم کد تأیید"] input') || [...document.querySelectorAll("dialog button")].some((b) => (b.textContent || "").includes("ورود خودکار")), { timeout: 25000 });
  if (await page.$('dialog [role="group"][aria-label="شش رقم کد تأیید"] input')) {
    await page.focus('dialog [role="group"][aria-label="شش رقم کد تأیید"] input');
    for (const ch of "123456") {
      await page.keyboard.type(ch);
      await new Promise((r) => setTimeout(r, 80));
    }
  }
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("dialog button")].find((b) => /ورود خودکار|تأیید و ادامه|ورود \/ ثبت‌نام/.test(b.textContent || "") && !b.disabled);
    btn?.click();
  });
  // if a fresh session, accept the policy sheet
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() => {
    const dlgs = [...document.querySelectorAll("dialog")].filter((d) => d.open && (d.textContent || "").includes("نکات مهم رزرو"));
    for (const d of dlgs) {
      d.querySelector('input[type="checkbox"]')?.click();
      const b = [...d.querySelectorAll("button")].find((x) => (x.textContent || "").includes("تأیید و ادامه"));
      setTimeout(() => b?.click(), 150);
    }
  });
  await page.waitForFunction(() => [...document.querySelectorAll("*")].some((n) => n.textContent === "این زمان موقتاً برای کل نوبت شما نگه داشته شده است."), { timeout: 30000 });
  ok("hold countdown covers the whole plan after auth", true);

  /* ---------- 5. commit ---------- */
  page.on("response", async (res) => {
    if (res.url().includes("/api/")) {
      let body = "";
      try { body = (await res.text()).slice(0, 220); } catch {}
      console.log(`[net ${res.status()}] ${res.url().replace(BASE, "")} ${body}`);
    }
  });
  try {
    await clickButton("تأیید و ثبت نوبت");
    await new Promise((r) => setTimeout(r, 2500));
    console.log("[post-commit] innerText:", await page.evaluate(() => document.body.innerText.slice(0, 700)));
    await page.waitForFunction(() => [...document.querySelectorAll("h1,h2")].some((h) => h.textContent.includes("رزرو شما ثبت شد")), { timeout: 30000 });
  } catch (e) {
    console.log("[commitfail] tail:", await page.evaluate(() => document.body.innerText.slice(-900)));
    console.log("[commitfail] state:", await page.evaluate(() => ({ step: window.location.pathname, main: document.querySelector("main, .theme-customer")?.firstElementChild?.className?.slice(0, 80), h: [...document.querySelectorAll("h1,h2,h3,[role=status]")].map((x) => x.textContent?.slice(0, 60)) })));
    throw e;
  }
  ok("confirmation step reached", true);
  const confirmText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  ok("single appointment receipt framing", confirmText.includes("نوبت") && !confirmText.includes("دو نوبت جدا"), "");
} catch (error) {
  ok("run completed without timeout", false, String(error).slice(0, 200));
} finally {
  console.log(results.join("\n"));
  await browser.close();
  process.exit(failures ? 1 : 0);
}
