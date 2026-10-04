import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = "src";
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(p) && !/atelier\.css/.test(p) && !/src.app.(admin|barber).page\.tsx$/.test(p.replace(/\\/g, "/"))) files.push(p);
  }
})(root);

// hex -> utility color name (Tailwind v4 @theme slug). text- uses remaps for contrast.
const MAP = {"#10261b":"brand-900","#07170f":"brand-950","#fbf9f4":"bone-50","#41504a":"bone-600","#eef0ea":"bone-200","#9f3b4c":"danger"}; const MAP1 = {
  "#c59b4b": "brass-400",
  "#855e16": "brass-600",
  "#6b5213": "brass-700",
  "#8a6a1e": "brass-800",
  "#f7f0d8": "brass-50",
  "#eadfb8": "brass-200",
  "#0f5a3b": "brand-700",
  "#0b4a30": "brand-800",
  "#14432f": "brand-600",
  "#2f4a3a": "brand-400",
  "#a9d0bd": "brand-200",
  "#cfe5da": "brand-100",
  "#e3f0e9": "brand-50",
  "#5f7168": "bone-500",
  "#59636b": "bone-500",
  "#1f2e27": "bone-700",
  "#3f5548": "bone-600",
  "#1a2e25": "bone-800",
  "#e2e5df": "bone-150",
  "#fdfcf9": "bone-50",
  "#f6f5f1": "bone-100",
  "#edece8": "bone-200",
  "#e5e0d4": "bone-300",
};
// text on light surfaces needs >=75 Lc; these fills-as-text fail -> darker token
const TEXT_OVERRIDES = { "#c59b4b": "brass-700", "#5f7168": "bone-500" };
const HEXES = Object.keys(MAP).join("|");
const re = new RegExp(`(^|[^\\w-])((?:[a-z-]+:)*(bg|text|border|from|via|to|ring|outline|decoration|fill|stroke|caret|divide|placeholder|accent)-)\\[(${HEXES})\\](\\/\\d{1,3})?`, "gi");
let n = 0, perFile = {};
for (const f of files) {
  const src = readFileSync(f, "utf8");
  let count = 0;
  const out = src.replace(re, (m, pre, cls, prop, hex, alpha) => {
    const lower = hex.toLowerCase();
    const target = prop === "text" && TEXT_OVERRIDES[lower] ? TEXT_OVERRIDES[lower] : MAP[lower];
    count++;
    return `${pre}${cls}${target}${alpha ?? ""}`;
  });
  if (count) {
    writeFileSync(f, out);
    n += count;
    perFile[relative(".", f)] = count;
  }
}
console.log("swapped:", n);
for (const [f, c] of Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(String(c).padStart(4), f);
