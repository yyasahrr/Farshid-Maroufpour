/* Screenshot helper for design review: node scripts/shot.mjs <out.png> [path=/admin] [full=1] */
import Chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3000";
const OUT = process.argv[2] ?? "shot.png";
const WHERE = process.argv[3] ?? "/admin";
const FULL = process.argv[4] === "1";

const browser = await puppeteer.launch({
  executablePath: await Chromium.executablePath(),
  args: [...Chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

if (WHERE.startsWith("/admin") || WHERE.startsWith("/barber")) {
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
}
await page.goto(`${BASE}${WHERE}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: OUT, fullPage: FULL });
console.log("saved", OUT, "url:", page.url());
await browser.close();
