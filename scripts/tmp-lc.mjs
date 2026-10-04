import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const A = require("apca-w3");
const t = (f, b) => console.log(`${f} on ${b} → Lc`, A.calcAPCA(f, b).toFixed(1));
for (const c of ["#b3bcb3", "#adb7ad", "#b8c1b8"]) t(c, "#171a18"), t(c, "#121413");
t("#8fdcbc", "#0f1110");
t("#86d4b0", "#0f1110");
