/* Design audit per .agents/skills (better-colors / better-accessibility / better-ui).
 * Everything reported is COMPUTED from the declared values — no eyeballing.
 * 1) raw-hex inventory in components (outside the token file)
 * 2) WCAG 2.1 ratio + APCA Lc (0.1.9 reference) for the declared token pairs
 * 3) physical-vs-logical spacing audit (better-layout), transition:all scan (better-ui)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const apcaPkg = require("apca-w3");
import path from "node:path";

const root = process.cwd();
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f.startsWith(".")) continue;
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(f)) files.push(p);
  }
})(path.join(root, "src"));

/* ---------- token extraction from globals.css ---------- */
const globals = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
function tokensIn(blockRe) {
  const m = globals.match(blockRe);
  const out = {};
  if (!m) return out;
  for (const mm of m[0].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[mm[1]] = mm[2].toLowerCase();
  return out;
}
const lightBlock = globals.slice(globals.indexOf(":root"), globals.indexOf(".theme-ops"));
const opsBlock = globals.slice(globals.indexOf(".theme-ops {"), globals.indexOf("/* Legacy utility-class"));
function parseBlock(startMarker, endMarker) {
  const s = globals.indexOf(startMarker);
  const e = endMarker ? globals.indexOf(endMarker) : globals.length;
  const out = {};
  for (const mm of globals.slice(s, e).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[mm[1]] = mm[2].toLowerCase();
  return out;
}
const LIGHT = parseBlock(":root", ".theme-ops");
const OPS = parseBlock(".theme-ops {", "/* Legacy");

/* ---------- color math ---------- */
const to255 = (h) => {
  let x = h.replace("#", "");
  if (x.length === 3 || x.length === 4) x = [...x.slice(0, 3)].map((c) => c + c).join("");
  x = x.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
};
function wcagRatio(a, b) {
  const lum = (h) => {
    const [r, g, bl] = to255(h).map((c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
function sRGB_to_Y(h) {
  const [r, g, b] = to255(h).map((c) => {
    const s = c / 255;
    return s <= 0.031308 ? s * 0.0773993808 : ((s + 0.0521368641) * 0.9473476746) ** 2.4;
  });
  let Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  if (Y > 1) Y = 1;
  return Y ** (1 / 2.4);
}
const YtoLc = (y) => (y > 1.0601 ? 1.0601 - 1 / y : y) * 100;
function apcaLc(fg, bg) { return apcaPkg.calcAPCA(fg, bg); }

/* ---------- 1. raw hexes in components ---------- */
const hexRe = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const inventory = new Map();
for (const f of files) {
  if (f.endsWith("globals.css")) continue;
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((ln, i) => {
    for (const m of ln.matchAll(hexRe)) {
      const key = m[0].toLowerCase();
      if (/from ["'].*(constants|colors)/.test(ln)) continue;
      if (!inventory.has(key)) inventory.set(key, []);
      inventory.get(key).push(`${path.relative(root, f)}:${i + 1}`);
    }
  });
}
const tokenValues = new Map();
for (const [name, v] of Object.entries({ ...LIGHT, ...OPS })) {
  const norm = v.length === 4 ? "#" + [...v.slice(1)].map((c) => c + c).join("") : v;
  if (!tokenValues.has(norm)) tokenValues.set(norm, name);
}
let rawLines = 0;
console.log("=== RAW HEX INVENTORY (component files) ===");
for (const [hex, spots] of [...inventory.entries()].sort((a, b) => b[1].length - a[1].length)) {
  rawLines += spots.length;
  const asToken = tokenValues.get(hex.length === 4 ? "#" + [...hex.slice(1)].map((c) => c + c).join("") : hex);
  console.log(`${hex.padEnd(8)} x${String(spots.length).padStart(3)}  ${asToken ? "== token: " + asToken : "(no token!)"}  ${spots.slice(0, 3).join(" ")}`);
}

/* ---------- 2. token pair contrast (measured) ---------- */
const pair = (name, block, fgTok, bgTok, sizeClass) => {
  const fg = block[fgTok] ?? root[fgTok] ?? (fgTok[0] === "#" ? fgTok : undefined);
  const bg = block[bgTok] ?? root[bgTok] ?? (bgTok[0] === "#" ? bgTok : undefined);
  if (!fg || !bg) return console.log(`SKIP ${name}`);
  const w = wcagRatio(fg, bg);
  const a = apcaLc(fg, bg);
  const wcagNeed = sizeClass === "body" ? 4.5 : sizeClass === "large" ? 3 : 3;
  const apcaNeed = sizeClass === "body" ? 75 : sizeClass === "ui" ? 60 : sizeClass === "stroke" ? 30 : 45;
  const fails = [];
  if (w < wcagNeed) fails.push(`WCAG ${w.toFixed(2)} < ${wcagNeed}`);
  if (Math.abs(a) < apcaNeed) fails.push(`APCA |${a.toFixed(0)}| < ${apcaNeed}`);
  console.log(`${fails.length ? "FAIL" : "ok  "}  ${name.padEnd(46)} ${bg} <- ${fg}  WCAG ${w.toFixed(2)}  APCA ${a.toFixed(0)} ${fails.join(" | ")}`);
};
console.log("\n=== SELFTEST (expect #767676/#fff ≈ 63, #000/#fff ≈ 106) ===");
console.log("gray/white:", apcaLc("#767676", "#ffffff").toFixed(1), "· black/white:", apcaLc("#000000", "#ffffff").toFixed(1), "· jade/ink:", apcaLc("#08120d", "#2fa37b").toFixed(1));
console.log("\n=== LIGHT (:root) ===");
pair("body text on page bg", LIGHT, "color-text-primary", "color-bg", "body");
pair("secondary text on surface", LIGHT, "color-text-secondary", "color-surface", "ui");
pair("muted text on surface", LIGHT, "color-text-muted", "color-surface", "ui");
pair("white on booking green (CTA)", LIGHT, "#ffffff", "color-booking", "large");
pair("brass text on shop bg", LIGHT, "color-brass-text", "color-shop", "ui");
pair("success on surface", LIGHT, "color-success", "color-surface", "ui");
pair("danger on surface", LIGHT, "color-danger", "color-surface", "ui");
pair("warning on surface", LIGHT, "color-warning", "color-surface", "ui");
pair("warning on its soft bg (no live pairing — Badge warn uses brass-700)", LIGHT, "color-warning", "color-warning-soft", "ui");
pair("danger on its soft bg", LIGHT, "color-danger", "color-danger-soft", "ui");
pair("text on sunken", LIGHT, "color-text-primary", "color-surface-sunken", "body");
pair("text-primary on soft accent", LIGHT, "color-text-primary", "color-accent-soft", "body");
console.log("\n=== OPS (.theme-ops) ===");
pair("primary on bg", OPS, "color-text-primary", "color-bg", "body");
pair("secondary on surface", OPS, "color-text-secondary", "color-surface", "ui");
pair("MUTED on surface (ops-meta)", OPS, "color-text-muted", "color-surface", "ui");
pair("MUTED on sunken (ops-meta rows)", OPS, "color-text-muted", "color-surface-sunken", "ui");
pair("jade on bg (stroke/fill role only)", OPS, "color-action-primary", "color-bg", "stroke");
pair("ink on jade (buttons)", OPS, "color-action-ink", "color-action-primary", "large");
pair("warning on sunken", OPS, "color-warning", "color-surface-sunken", "ui");
pair("danger on sunken", OPS, "color-danger", "color-surface-sunken", "ui");

/* ---------- 3. layout & motion smell scan ---------- */
const phys = new Map();
let tAll = 0;
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((ln, i) => {
    const rel = path.relative(root, f);
    for (const m of ln.matchAll(/[\s"'`](?:(?:hover|focus|sm|md|lg|group-hover):)*(-?(?:m[rl]|[p][rl])-\d+(?:\.\d+)?)/g)) {
      const k = rel.split("/").slice(-1)[0];
      phys.set(k, (phys.get(k) ?? 0) + 1);
    }
    if (/transition:\s*all/.test(ln) || /transition-all/.test(ln)) {
      tAll++;
      if (tAll <= 8) console.log("transition:all ->", `${rel}:${i + 1}`);
    }
  });
}
console.log("\n=== PHYSICAL L/R SPACING (RTL project) top files ===");
for (const [f, n] of [...phys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(String(n).padStart(4), f);
console.log("total:", [...phys.values()].reduce((a, b) => a + b, 0), "· transition:all total:", tAll);
