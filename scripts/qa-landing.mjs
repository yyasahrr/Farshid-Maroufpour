process.env.LD_LIBRARY_PATH = "/tmp/al2023/lib";
import Chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
const BASE = process.argv[2] ?? "http://127.0.0.1:5001";
const R = []; let F = 0;
const ok = (n, c, x = "") => { R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? ` — ${x}` : ""}`); if (!c) F++; };
const browser = await puppeteer.launch({ executablePath: await Chromium.executablePath(), args: [...Chromium.args, "--no-sandbox", "--disable-dev-shm-usage"], headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 1200));

ok("chip «پیشنهاد اصلی» removed", await page.evaluate(() => !document.body.innerText.includes("پیشنهاد اصلی")));
const card = await page.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find(x => (x.textContent || "").includes("رزرو خدمات"));
  if (!a) return null;
  const cs = getComputedStyle(a);
  return { tag: a.tagName, href: a.getAttribute("href"), bg: cs.backgroundColor, border: cs.borderTopColor, color: cs.color };
});
ok("booking card is a real <a> to /booking (no auth gate, works without JS)", card?.tag === "A" && card?.href === "/booking", JSON.stringify(card));
ok("card carries the dark-premium booking look", card?.bg === "rgb(22, 26, 23)" && (card?.border || "").startsWith("rgba(217, 179, 100"), `bg=${card?.bg} border=${card?.border}`);

// click-through: lands on the wizard directly (real mouse click)
await page.click("a.bento-shortcut-booking");
await page.waitForFunction(() => location.pathname === "/booking", { timeout: 15000 });
await new Promise(r => setTimeout(r, 1500));
ok("click navigates to /booking wizard", await page.evaluate(() => !!document.querySelector("h1")?.textContent?.includes("چه خدمتی")));

// remaining actions from the landing
await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 900));
for (const [label, path] of [["آکادمی", "/academy"], ["فروشگاه", "/shop"], ["ورود به سایت", "/home"]]) {
  await page.evaluate((l) => { const el = [...document.querySelectorAll("a")].find(x => (x.textContent || "").trim().startsWith(l)); el?.click(); }, label);
  await page.waitForFunction((p) => location.pathname.startsWith(p), { timeout: 12000 }, path).catch(() => {});
  ok(`«${label}» → ${path}`, page.url().includes(path), page.url().replace(BASE, ""));
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 700));
}
// contact dialog (JS-interactive)
await page.evaluate(() => { [...document.querySelectorAll("button")].find(x => (x.textContent || "").includes("آدرس و تماس"))?.click(); });
await new Promise(r => setTimeout(r, 600));
ok("«آدرس و تماس» opens the info dialog", await page.evaluate(() => [...document.querySelectorAll("dialog")].some(d => d.open && (d.innerText || "").includes("آدرس و تماس"))));
// login button opens the OTP modal
await page.evaluate(() => { [...document.querySelectorAll("button")].find(x => (x.textContent || "").trim() === "ورود")?.click(); });
await new Promise(r => setTimeout(r, 700));
ok("«ورود» opens the auth modal with phone input", await page.evaluate(() => [...document.querySelectorAll("dialog")].some(d => d.open && !!d.querySelector('input[placeholder="0912 345 6789"]'))));

process.on("exit", () => console.log(R.join("\n")));
await browser.close();
process.exit(F ? 1 : 0);
