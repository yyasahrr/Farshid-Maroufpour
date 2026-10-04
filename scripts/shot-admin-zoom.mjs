import Chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3000";
const browser = await puppeteer.launch({
  executablePath: await Chromium.executablePath(),
  args: [...Chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 820 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type('input[name="phone"]', "09120000001");
await page.type('input[name="password"]', "admin123");
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => null),
  page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("ورود"));
    b?.click();
  }),
]);
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 700));

for (const id of ["courses", "skills", "contact", "calendar"]) {
  const found = await page.evaluate((sec) => {
    const el = document.getElementById(sec);
    if (!el) return false;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: "instant" });
    return true;
  }, id);
  await new Promise((r) => setTimeout(r, 650));
  if (found) await page.screenshot({ path: `zoom-${id}.png` });
  console.log(id, found ? "captured" : "NOT FOUND");
}
await browser.close();
