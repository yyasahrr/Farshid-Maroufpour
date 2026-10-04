/**
 * Unit tests for the visit planner (§80 scheduling cases).
 * Run with: npm run test:planner
 *
 * These cover the rules that MUST hold everywhere:
 * multi-service = one visit, one start time, continuous chaining, processing
 * only from data, combination rules enforced, nearby-time recovery, whole-plan
 * window validation (not just the picked slot), parallel only by definition,
 * barber filters, multi-attendee staff collision safety.
 */
import assert from "node:assert/strict";
import type { DayContext, ResolvedService } from "../src/lib/availability";
import {
  PLANNER_LIMITS,
  planVisit,
  sameBarberClusters,
  type BarberCandidate,
  type CombinationRule,
  type PlannerData,
} from "../src/lib/visit-planner";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

/* ---------- fixtures ---------- */

const svc = (over: Partial<ResolvedService> & { id: number; name: string; price: number }): ResolvedService => ({
  ...over,
  durationMin: over.durationMin ?? 60,
  barberDurationMin: over.barberDurationMin ?? over.durationMin ?? 60,
  bufferMin: over.bufferMin ?? 0,
  processingMin: Math.max(0, (over.durationMin ?? 60) - (over.barberDurationMin ?? over.durationMin ?? 60)),
  allowParallel: over.allowParallel ?? false,
  managerApprovalRequired: over.managerApprovalRequired ?? false,
  paymentMode: over.paymentMode ?? "NO_PAYMENT",
  depositAmount: over.depositAmount ?? 0,
  amountDueOnline: over.amountDueOnline ?? 0,
  remainingDue: over.remainingDue ?? (over.price ?? 0),
});

const day = (over: Partial<DayContext> = {}): DayContext => ({
  open: true,
  startMin: 600,
  endMin: 1320,
  busy: [],
  blocked: [],
  ...over,
});

const cand = (barberId: number, service: ResolvedService, ctx: DayContext = day()): BarberCandidate => ({
  barberId,
  barberName: `B${barberId}`,
  barberSlug: `b-${barberId}`,
  ctx,
  service,
});

function makeData(pairs: Array<{ attendee: string; serviceId: number; candidates: BarberCandidate[] }>, rules: CombinationRule[] = []): PlannerData {
  const candidates = new Map<string, BarberCandidate[]>();
  for (const p of pairs) candidates.set(`${p.attendee}:${p.serviceId}`, p.candidates);
  return {
    candidates,
    rules,
    now: { date: "2026-10-06", minute: 0 }, // a future date; no past limiting
    ...PLANNER_LIMITS,
    barberNames: new Map([[1, "علی"], [2, "رضا"], [3, "محمد"]]),
  };
}

const haircut = svc({ id: 1, name: "اصلاح مو", price: 400000, durationMin: 60, bufferMin: 10 });
const beard = svc({ id: 2, name: "اصلاح ریش", price: 300000, durationMin: 30, bufferMin: 5 });
const color = svc({ id: 3, name: "رنگ مو", price: 1200000, durationMin: 90, barberDurationMin: 45, bufferMin: 15 });
const skin = svc({ id: 4, name: "پاکسازی پوست", price: 500000, durationMin: 45, bufferMin: 5, allowParallel: true });

/* ---------- 1. two services = one continuous visit, one start ---------- */
test("multi-service plans as ONE continuous visit at the single start time", () => {
  const data = makeData([
    { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut)] },
    { attendee: "primary", serviceId: 2, candidates: [cand(1, beard)] },
  ]);
  const out = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [1, 2] }] }, data);
  assert.ok(out.plan, "plan should exist");
  assert.equal(out.plan!.startMin, 960); // 16:00
  assert.equal(out.plan!.segments[0].startMin, 960);
  assert.equal(out.plan!.segments[0].clientEndMin, 1020); // 17:00
  assert.equal(out.plan!.segments[1].startMin, 1020); // beard follows immediately, no gap
  assert.equal(out.plan!.segments[1].clientEndMin, 1050); // 17:30
  assert.equal(out.plan!.endMin, 1050);
  assert.equal(out.plan!.totalMinutes, 90);
  assert.equal(out.plan!.segments[0].barberEndMin, 1030); // barber occupied until 17:10 (buffer)
  assert.equal(out.plan!.totalPrice, 700000);
});

test("no artificial gaps: a later free slot never splits the visit", () => {
  // Barber has a booking 16:00-17:00 but 17:00 is free; starting at 16:30 is
  // invalid for haircut(60) — enumeration must skip it and offer 17:10+ only.
  const ctx = day({ busy: [{ start: 960, end: 1020, id: 99 }] });
  const data = makeData([
    { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut, ctx)] },
  ]);
  const out = planVisit({ date: "2026-10-06", startMin: null, attendees: [{ attendeeId: "primary", serviceIds: [1] }] }, data);
  assert.ok(out.validStarts.every((s) => s >= 1020 || s < 960 - 70), "starts must respect the busy span");
  assert.ok(!out.validStarts.includes(990), "16:30 overlaps the 16:00–17:00 booking window");
});

/* ---------- 2. processing time only from the service definition ---------- */
test("processing time stretches the visit but stays ONE appointment", () => {
  const data = makeData([
    { attendee: "primary", serviceId: 3, candidates: [cand(1, color)] },
  ]);
  const out = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [3] }] }, data);
  assert.ok(out.plan);
  const seg = out.plan!.segments[0];
  assert.equal(seg.startMin, 960);
  assert.equal(seg.clientEndMin, 1050); // client waits 90: 16:00–17:30
  assert.equal(seg.barberEndMin, 1020); // barber works 45 + buffer 15 → free at 17:00
  assert.equal(seg.processingMin, 45);
  assert.equal(out.plan!.totalMinutes, 90);
  assert.equal(out.plan!.segments.length, 1);
});

/* ---------- 3. combination rules ---------- */
test("illegal pair is refused with its reason", () => {
  const rules: CombinationRule[] = [{ a: 1, b: 3, canCombine: false, sameBarberRequired: false, note: "با پکیج دامادی قابل ترکیب نیست" }];
  const data = makeData(
    [
      { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut)] },
      { attendee: "primary", serviceId: 3, candidates: [cand(1, color)] },
    ],
    rules,
  );
  const out = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [1, 3] }] }, data);
  assert.equal(out.plan, null);
  const issue = out.issues.find((i) => i.code === "COMBINATION_NOT_ALLOWED");
  assert.ok(issue);
  assert.match(issue!.message, /پکیج دامادی/);
});

test("same-barber rule clusters and shares one barber", () => {
  const rules: CombinationRule[] = [{ a: 1, b: 2, canCombine: true, sameBarberRequired: true, note: "" }];
  const data = makeData(
    [
      { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut), cand(2, haircut)] },
      { attendee: "primary", serviceId: 2, candidates: [cand(2, beard)] }, // only barber 2 does beard
    ],
    rules,
  );
  const out = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [1, 2] }] }, data);
  assert.ok(out.plan); // barber 2 can do both → same barber honoured
  assert.equal(new Set(out.plan!.segments.map((s) => s.barberId)).size, 1);
  assert.equal(out.plan!.segments[0].barberId, 2);
});

test("same-barber rule fails with an explicit reason when no shared barber exists", () => {
  const rules: CombinationRule[] = [{ a: 1, b: 2, canCombine: true, sameBarberRequired: true, note: "" }];
  const data = makeData(
    [
      { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut)] },
      { attendee: "primary", serviceId: 2, candidates: [cand(2, beard)] },
    ],
    rules,
  );
  const out = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [1, 2] }] }, data);
  assert.equal(out.plan, null);
  assert.equal(out.issues[0].code, "SAME_BARBER_UNAVAILABLE");
});

test("same-barber clusters chain transitively", () => {
  const rules: CombinationRule[] = [
    { a: 1, b: 2, canCombine: true, sameBarberRequired: true, note: "" },
    { a: 2, b: 4, canCombine: true, sameBarberRequired: true, note: "" },
  ];
  const clusters = sameBarberClusters([1, 2, 3, 4], rules);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.find((c) => c.includes(1))!.sort(), [1, 2, 4]);
});

/* ---------- 4. staff matching & times ---------- */
test("picked time full for whole plan → nearby recovery, no reset", () => {
  const ctx = day({ busy: [{ start: 960, end: 1030, id: 7 }] }); // barber busy through haircut+buffer
  const data = makeData([
    { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut, ctx)] },
  ]);
  const out = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [1] }] }, data);
  assert.equal(out.plan, null);
  assert.match(out.issues[0].message, /نزدیک‌ترین زمان‌ها/);
  assert.ok(out.nearby.length > 0);
  assert.ok(out.nearby[0] > 960);
});

test("16:00 empty is not enough — the WHOLE window must fit before closing", () => {
  const ctx = day({ endMin: 1035 }); // salon closes 17:15
  const data = makeData([
    { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut, ctx)] }, // 60 + buffer 10
    { attendee: "primary", serviceId: 2, candidates: [cand(1, beard, ctx)] },
  ]);
  // 16:00 haircut ends 17:10 incl. buffer — fits; beard then exceeds close → whole start invalid.
  const out = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [1, 2] }] }, data);
  assert.equal(out.plan, null);
  assert.equal(out.nearby.length, 0);
  assert.match(out.issues[0].message, /ظرفیت ندارد/);
});

test("barber filter: barber without the skill gets a named reason, not silence", () => {
  const data = makeData(
    [{ attendee: "primary", serviceId: 3, candidates: [cand(1, color)] }], // only barber 1 offers colour
  );
  const out = planVisit(
    { date: "2026-10-06", startMin: null, attendees: [{ attendeeId: "primary", serviceIds: [3], barberId: 2 }] },
    data,
  );
  assert.equal(out.plan, null);
  assert.equal(out.issues[0].code, "NO_STAFF");
  assert.match(out.issues[0].message, /رضا این خدمت را ارائه نمی‌دهد/);
});

test("different barbers allowed when one lacks the time", () => {
  const busyCtx = day({ busy: [{ start: 1020, end: 1080, id: 3 }] }); // barber 1 busy right after haircut
  const data = makeData([
    { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut)] },
    { attendee: "primary", serviceId: 2, candidates: [cand(1, beard, busyCtx), cand(2, beard)] },
  ]);
  const out = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [1, 2] }] }, data);
  assert.ok(out.plan);
  const [a, b] = out.plan!.segments;
  assert.equal(a.barberId, 1);
  assert.equal(b.barberId, 2, "beard moves to the available barber, haircut stays");
  assert.equal(b.startMin, 1020, "still follows the client's free minute, no gap");
});

/* ---------- 5. parallel execution only when both services allow it ---------- */
test("parallel segments co-start only when both definitions allow it", () => {
  const data = makeData(
    [
      { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut)] },
      { attendee: "primary", serviceId: 4, candidates: [cand(2, skin)] },
    ],
    [],
  );
  // haircut does NOT allow parallel → skin must wait for the client anyway.
  const serial = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [1, 4] }] }, data);
  assert.ok(serial.plan);
  assert.equal(serial.plan!.segments[1].startMin, 1020);
  // colour processing + skin: both allowParallel → co-start at the visit time.
  const parallelColor = svc({ id: 3, name: "رنگ مو", price: 1200000, durationMin: 90, barberDurationMin: 45, bufferMin: 15, allowParallel: true });
  const data2 = makeData([
    { attendee: "primary", serviceId: 3, candidates: [cand(1, parallelColor)] },
    { attendee: "primary", serviceId: 4, candidates: [cand(2, skin)] },
  ]);
  const both = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [3, 4] }] }, data2);
  assert.ok(both.plan);
  assert.equal(both.plan!.segments[1].startMin, 960, "skin runs while colour processes");
});

/* ---------- 6. multi-attendee: staff never double-booked by the plan ---------- */
test("two attendees cannot share one barber at overlapping minutes", () => {
  const data = makeData([
    { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut)] },
    { attendee: "guest1", serviceId: 1, candidates: [cand(1, haircut)] },
  ]);
  const out = planVisit(
    {
      date: "2026-10-06",
      startMin: 960,
      attendees: [
        { attendeeId: "primary", serviceIds: [1] },
        { attendeeId: "guest1", serviceIds: [1] },
      ],
    },
    data,
  );
  assert.equal(out.plan, null, "one barber cannot be in two chairs at once");
});

test("two attendees with two barbers share the visit start", () => {
  const data = makeData([
    { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut)] },
    { attendee: "guest1", serviceId: 1, candidates: [cand(2, haircut)] },
  ]);
  const out = planVisit(
    {
      date: "2026-10-06",
      startMin: 960,
      attendees: [
        { attendeeId: "primary", serviceIds: [1] },
        { attendeeId: "guest1", serviceIds: [1] },
      ],
    },
    data,
  );
  assert.ok(out.plan);
  assert.equal(out.plan!.segments[0].startMin, 960);
  assert.equal(out.plan!.segments[1].startMin, 960);
});

/* ---------- 7. today: lead-time & past protection ---------- */
test("today respects past minutes; tomorrow has no lead constraint", () => {
  const data = makeData([{ attendee: "primary", serviceId: 1, candidates: [cand(1, haircut)] }]);
  const sameDay = { ...data, now: { date: "2026-10-06", minute: 995 } }; // 16:35 now
  const out1 = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [1] }] }, sameDay);
  assert.equal(out1.plan, null);
  assert.equal(out1.issues[0].code, "PAST_OR_TOO_LATE");
  const out2 = planVisit({ date: "2026-10-07", startMin: 600, attendees: [{ attendeeId: "primary", serviceIds: [1] }] }, sameDay);
  assert.ok(out2.plan, "a future day may start at opening hour even if the clock already passed it today");
});

test("closed day yields no starts", () => {
  const data = makeData([{ attendee: "primary", serviceId: 1, candidates: [cand(1, haircut, day({ open: false }))] }]);
  const out = planVisit({ date: "2026-10-06", startMin: null, attendees: [{ attendeeId: "primary", serviceIds: [1] }] }, data);
  assert.deepEqual(out.validStarts, []);
});

test("blocked window (break/meeting) is skipped by the enumeration", () => {
  const ctx = day({ blocked: [{ start: 900, end: 1020 }] }); // 15:00–17:00 meeting
  const data = makeData([{ attendee: "primary", serviceId: 1, candidates: [cand(1, haircut, ctx)] }]);
  const out = planVisit({ date: "2026-10-06", startMin: 960, attendees: [{ attendeeId: "primary", serviceIds: [1] }] }, data);
  assert.equal(out.plan, null);
  assert.ok(out.nearby.includes(1020), "17:00 right after the meeting fits");
});

/* ---------- named reasons for class / vacation windows ---------- */
test("class window on the pinned barber yields a named reason, not a generic booked message", () => {
  const ctx = day({ blocked: [{ start: 1020, end: 1155, kind: "class", title: "فید پیشرفته" }] });
  const data = makeData([
    { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut, ctx), cand(2, haircut, day())] },
  ]);
  const out = planVisit({ date: "2026-10-06", startMin: 1050, attendees: [{ attendeeId: "primary", serviceIds: [1], barberId: 1 }] }, data);
  assert.equal(out.plan, null);
  assert.ok(out.issues.some((i) => i.message.includes('کلاس «فید پیشرفته»')), `expected class reason, got ${JSON.stringify(out.issues)}`);
  assert.ok(out.nearby.length > 0 && out.nearby[0] >= 1155, "nearby must land after the class + buffer");
});

test("mixed blockers keep the neutral message (no lying about a single cause)", () => {
  const classCtx = day({ blocked: [{ start: 1020, end: 1155, kind: "class", title: "فید پیشرفته" }] });
  const busyCtx = day({ busy: [{ start: 1020, end: 1155, id: 5, kind: "booking" }] });
  const data = makeData([
    { attendee: "primary", serviceId: 1, candidates: [cand(1, haircut, classCtx), cand(2, haircut, busyCtx)] },
  ]);
  const out = planVisit({ date: "2026-10-06", startMin: 1050, attendees: [{ attendeeId: "primary", serviceIds: [1] }] }, data);
  assert.equal(out.plan, null);
  assert.ok(out.issues.every((i) => !i.message.includes("کلاس")), "must not claim a class when causes differ");
});

console.log(`\nvisit-planner: ${passed} tests passed`);
