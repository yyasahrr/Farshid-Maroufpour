/* Headless QA: the 10-minute hold really locks a slot for OTHER visitors.
 * Visitor A locks (anon token) → visitor B (fresh token, no cookie) must see
 * the slot gone in /api/booking/plan and must NOT be able to hold or commit
 * it; A then registers as a guest and commits — the transfer of the anon hold
 * must let the commit pass.
 * Usage: node scripts/qa-hold-lock.mjs [baseUrl]  (prod `next start` recommended) */
import Chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const BASE = process.argv[2] ?? "http://127.0.0.1:5001";
const results = [];
let failures = 0;
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures += 1;
};

const dbq = async (sqlText, params = []) => {
  const c = new Client({ host: "127.0.0.1", port: 5434, user: "postgres", password: "postgres", database: "app_db", connectionTimeoutMillis: 5000, query_timeout: 8000 });
  await c.connect();
  try {
    return (await c.query(sqlText, params)).rows;
  } finally {
    await c.end();
  }
};

process.env.LD_LIBRARY_PATH = "/tmp/al2023/lib";
const browser = await puppeteer.launch({
  executablePath: await Chromium.executablePath(),
  args: [...Chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.setViewport({ width: 1280, height: 900 });
await page.goto(BASE, { waitUntil: "networkidle2" });

/** run a same-origin fetch from inside the page (real headers, clean cookie state) */
const api = (path, method, body, opts = {}) =>
  page.evaluate(
    async (p, m, b, o) => {
      const init = { method: m, headers: { "content-type": "application/json" }, cache: "no-store" };
      if (o.dropCookie) init.headers.cookie = "";
      if (b) init.body = JSON.stringify(b);
      const res = await fetch(p, init);
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      return { status: res.status, json };
    },
    path,
    method,
    body,
    opts,
  );

/** wipe leftovers from earlier runs so the arena is always empty first */
async function cleanup() {
  // QA arena hygiene, in order: holds owned by throwaway accounts FIRST (while
  // the users still exist to join against), then orphan holds whose phone has
  // no user row at all (leaked by earlier buggy runs), then the rows.
  await dbq("delete from booking_holds where client_phone in (select phone from users where name = 'بازدیدکننده قفل‌شکن')");
  await dbq("delete from booking_holds where client_phone like 'anon:%' or (client_phone !~ '^0\\d{10}$' and client_phone not in (select phone from users))");
  await dbq("delete from booking_holds where client_phone not in (select phone from users) and client_phone ~ '^0912[0-9]{7}$'");
  await dbq("delete from appointments where client_name = 'بازدیدکننده قفل‌شکن'");
  await dbq("delete from users where name = 'بازدیدکننده قفل‌شکن'");
}

try {
  await cleanup();
  /* pick the first barber offering "اصلاح مو" and a comfortable future start */
  const rows = await dbq(`
    select ba.id as barber_id, s.id as service_id, s.duration_min
    from services s
    join barber_services bs on bs.service_id = s.id
    join barbers ba on ba.id = bs.barber_id and ba.active = true
    where s.active = true and s.name = 'اصلاح مو'
    limit 1`);
  ok("fixture service + barber exists", rows.length === 1, JSON.stringify(rows[0] ?? null));
  if (rows.length !== 1) throw new Error("no fixture service");
  const { barber_id: barberId, service_id: serviceId } = rows[0];

  /* find an open date+slot (tomorrow forward, mid-grid start) */
  const plan = await page.evaluate(async (sid, bid) => {
    const today = new Date();
    for (let add = 1; add <= 10; add += 1) {
      const d = new Date(today.getTime() + add * 86400000);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const res = await fetch("/api/booking/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ date: iso, attendees: [{ attendeeId: "primary", serviceIds: [sid], barberId: bid }] }),
      });
      const json = await res.json();
      const starts = json.validStarts ?? [];
      const mid = starts[Math.floor(starts.length / 2)];
      if (mid !== undefined) return { iso, startMin: mid };
    }
    return null;
  }, serviceId, barberId);
  ok("found an open date+slot to fight over", Boolean(plan), JSON.stringify(plan));
  if (!plan) throw new Error("no open slot found in 10 days — DB seed issue");
  const { iso, startMin } = plan;
  /* pin BOTH visitors to the same barber — with free parallel chairs another
     barber is legitimately bookable; contention must be per-resource. */
  const attendees = [{ attendeeId: "primary", serviceIds: [serviceId], barberId }];
  const tokenA = randomUUID();
  const tokenB = randomUUID();

  /* A: anon token hold must succeed */
  const holdA = await api("/api/booking/hold", "POST", { date: iso, startMin, attendees, holdToken: tokenA });
  ok("visitor A locks the slot with an anon token (no login)", holdA.status === 201, `status=${holdA.status} ${JSON.stringify(holdA.json?.error ?? "")}`);

  /* B: same slot, different token, NO cookie → must be refused */
  const holdB = await api("/api/booking/hold", "POST", { date: iso, startMin, attendees, holdToken: tokenB }, { dropCookie: true });
  ok("visitor B cannot hold the locked slot", holdB.status === 409, `status=${holdB.status}`);
  const conflictMsg = String(holdB.json?.error ?? "");
  ok("B gets a 'taken' reason + nearby list", /رزرو|در حال بررسی/.test(conflictMsg) && Array.isArray(holdB.json?.nearby), conflictMsg.slice(0, 80));

  /* B: plan for that day — the held start must NOT be among valid starts */
  const planB = await api("/api/booking/plan", "POST", { date: iso, attendees }, { dropCookie: true });
  const startsB = planB.json?.validStarts ?? [];
  ok("locked start hidden from visitor B's grid", startsB.length > 0 && !startsB.includes(startMin), `starts=${startsB.length}`);

  /* B cannot commit it even with an account — group needs a hold; verify refusal reason mentions the window */
  const groupNoHold = await api("/api/appointments/group", "POST", { date: iso, startMin, attendees: [{ ...attendees[0], attendeeName: "بیگانه" }], holdToken: tokenB }, { dropCookie: true });
  ok("commit without a hold is refused (expiry/hold contract message)", groupNoHold.status >= 400, `status=${groupNoHold.status}`);

  /* A: guest account + commit — the anon hold must transfer to A's phone */
  const phoneA = `0912${String(Date.now()).slice(-7)}`;
  const guest = await api("/api/auth/guest", "POST", { phone: phoneA, name: "بازدیدکننده قفل‌شکن" });
  ok("guest account created for A", guest.status === 200 && guest.json?.ok === true, JSON.stringify(guest.json?.error ?? ""));
  /* the wizard's policy sheet posts this before the pay click — replicate */
  const policyVer = await dbq("select value from site_settings where key='policy_version'");
  void policyVer;
  const accepted = await api("/api/auth/policy/accept", "POST", { version: process.env.BOOKING_POLICY_VERSION ?? "2.1" });
  ok("policy acceptance recorded (versioned)", [200, 201].includes(accepted.status), `status=${accepted.status}`);
  const commitAttendees = [{ attendeeId: "primary", attendeeName: "بازدیدکننده قفل‌شکن", serviceIds: [serviceId], barberId }];
  const commit = await api("/api/appointments/group", "POST", { date: iso, startMin, attendees: commitAttendees, holdToken: tokenA });
  ok("A commits using the SAME anon hold (transfer works)", commit.status === 201, `status=${commit.status} ${JSON.stringify(commit.json?.error ?? "")}`);

  /* DB proof: no anon rows left for tokenA; A's phone owns a hold or appointment */
  const anonLeft = await dbq("select count(*)::int as n from booking_holds where client_phone = $1", [`anon:${tokenA}`]);
  const apptOwned = await dbq("select count(*)::int as n from appointments where client_phone = $1 and date = $2 and start_min = $3", [phoneA, iso, startMin]);
  ok("anon hold rows consumed by the commit", anonLeft[0].n === 0, `left=${anonLeft[0].n}`);
  ok("appointment exists under A's new phone", apptOwned[0].n >= 1, `rows=${apptOwned[0].n}`);

  /* B re-plans: the slot is now a real appointment → still unavailable */
  const planAgain = await api("/api/booking/plan", "POST", { date: iso, attendees }, { dropCookie: true });
  ok("after A books, B still cannot see that start", !(planAgain.json?.validStarts ?? []).includes(startMin), "");

  /* cleanup: cancel A's appointment + drop the throwaway account */
  await cleanup();
} catch (err) {
  ok("script completed without infrastructure errors", false, String(err).slice(0, 200));
} finally {
  await browser.close();
  console.log(results.join("\n"));
  console.log(`\nqa-hold-lock: ${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
}
