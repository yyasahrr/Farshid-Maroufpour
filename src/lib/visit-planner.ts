/**
 * Visit planner — the scheduling brain behind the customer wizard.
 *
 * Contract (design/ux/booking-flow.md): for one attendee, N services produce
 * ONE continuous visit with ONE client-visible start time. The customer never
 * picks per-service times; this module chains segments back-to-back, honours
 * combination rules (pairwise legality, same-barber clusters, parallel
 * execution) and never inserts artificial gaps. Processing waiting appears only
 * when the service definition itself carries it (client end > barber end).
 *
 * Pure functions over prefetched data — no DB imports — so the rules can be
 * unit-tested and the server reuses them as the single validation authority.
 */

import type { DayContext, ResolvedService } from "./availability";
import { overlaps } from "./windows";
import { minutesToLabel } from "./time";

export type CombinationRule = {
  a: number;
  b: number;
  canCombine: boolean;
  sameBarberRequired: boolean;
  note: string;
};

export type BarberCandidate = {
  barberId: number;
  barberName: string;
  barberSlug: string;
  ctx: DayContext;
  service: ResolvedService;
};

export type ServicePin = { serviceId: number; barberId: number };

export type AttendeeRequest = {
  attendeeId: string;
  /** Ordered selection — the chain is planned in this order. */
  serviceIds: number[];
  /** Pin the whole attendee chain to one staff member (barber-filter UX). */
  barberId?: number | null;
  /** Per-service barber choices (step 1 of the wizard). Cluster members that
   *  share a rule inherit the pin of their group; conflicts are rejected in
   *  planVisit before anything is scheduled. */
  servicePins?: ServicePin[] | null;
};

export type VisitRequest = {
  date: string;
  /** The ONE start time the client picked (null = enumerate all valid starts). */
  startMin: number | null;
  attendees: AttendeeRequest[];
};

export type PlannerData = {
  /** key: `${attendeeId}:${serviceId}` → candidates for that pair */
  candidates: Map<string, BarberCandidate[]>;
  rules: CombinationRule[];
  /** Wall clock in the salon timezone, injected for testability. */
  now: { date: string; minute: number };
  gridStartMin: number;
  gridEndMin: number;
  slotStep: number;
  /** A booking may not start closer to "now" than this lead time (today only). */
  minLeadMin: number;
  /** Barber names for filter-aware error copy. */
  barberNames?: Map<number, string>;
};

export const PLANNER_LIMITS = {
  gridStartMin: 9 * 60,
  gridEndMin: 23 * 60,
  slotStep: 30,
  minLeadMin: 0,
} as const;

/** Shared context for one scheduling attempt of one date/start. */
type Attempt = {
  date: string;
  startMin: number;
  data: PlannerData;
  /** Spans the plan itself already claimed, per barber (multi-attendee safety). */
  planBusy: Map<number, { start: number; end: number; attendeeId: string }[]>;
};

export type VisitSegment = {
  attendeeId: string;
  serviceId: number;
  serviceName: string;
  barberId: number;
  barberName: string;
  barberSlug: string;
  date: string;
  startMin: number;
  /** Barber-occupied window = start + barberDuration + buffer. */
  barberEndMin: number;
  /** Client-visible end of THIS service (includes processing). */
  clientEndMin: number;
  durationMin: number;
  barberDurationMin: number;
  bufferMin: number;
  processingMin: number;
  price: number;
  paymentMode: ResolvedService["paymentMode"];
  amountDueOnline: number;
  remainingDue: number;
  managerApprovalRequired: boolean;
};

export type VisitPlan = {
  date: string;
  /** Visit window the customer sees: one range for the whole booking. */
  startMin: number;
  endMin: number;
  totalMinutes: number;
  segments: VisitSegment[];
  totalPrice: number;
  amountDueOnline: number;
  remainingDue: number;
  /** Services in this visit that need a manager to confirm the booking. */
  requiresManagerApproval: boolean;
  distinctBarbers: number;
};

export type PlanIssue = {
  code:
    | "COMBINATION_NOT_ALLOWED"
    | "SAME_BARBER_UNAVAILABLE"
    | "SAME_BARBER_PIN_CONFLICT"
    | "PIN_FILTER_CONFLICT"
    | "NO_STAFF"
    | "NO_CAPACITY_AT_TIME"
    | "PAST_OR_TOO_LATE"
    | "EMPTY_SELECTION";
  message: string;
  serviceIds?: number[];
};

export type PlanOutcome = {
  plan: VisitPlan | null;
  /** Start times (minutes of day) on this date where the whole request fits. */
  validStarts: number[];
  /** Shown when the picked time lost its capacity — recovery, not a dead end. */
  nearby: number[];
  issues: PlanIssue[];
};

export function normalizeRule(a: number, b: number) {
  return a < b ? { a, b } : { a: b, b: a };
}

export function findRule(rules: CombinationRule[], a: number, b: number) {
  const pair = normalizeRule(a, b);
  return rules.find((r) => r.a === pair.a && r.b === pair.b) ?? null;
}

function nameOfService(data: PlannerData, id: number): string {
  for (const list of data.candidates.values()) {
    const hit = list.find((c) => c.service.id === id);
    if (hit) return hit.service.name;
  }
  return `سرویس ${id}`;
}

/** Legality of a selection against combination rules — time can't rescue an illegal pair. */
export function selectionIssues(serviceIds: number[], rules: CombinationRule[], data: PlannerData): PlanIssue[] {
  const issues: PlanIssue[] = [];
  for (let i = 0; i < serviceIds.length; i += 1) {
    for (let j = i + 1; j < serviceIds.length; j += 1) {
      const rule = findRule(rules, serviceIds[i], serviceIds[j]);
      if (rule && !rule.canCombine) {
        const a = nameOfService(data, serviceIds[i]);
        const b = nameOfService(data, serviceIds[j]);
        issues.push({
          code: "COMBINATION_NOT_ALLOWED",
          message: rule.note.trim()
            ? `«${a}» با «${b}» قابل ترکیب نیست — ${rule.note}`
            : `«${a}» با «${b}» قابل ترکیب نیست.`,
          serviceIds: [serviceIds[i], serviceIds[j]],
        });
      }
    }
  }
  return issues;
}

/** Connected components of the same-barber-required relation over the selection. */
export function sameBarberClusters(serviceIds: number[], rules: CombinationRule[]): number[][] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur);
      if (next === undefined) break;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  for (const id of serviceIds) parent.set(id, id);
  for (const rule of rules) {
    if (!rule.sameBarberRequired) continue;
    if (!serviceIds.includes(rule.a) || !serviceIds.includes(rule.b)) continue;
    const ra = find(rule.a);
    const rb = find(rule.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<number, number[]>();
  for (const id of serviceIds) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  return [...groups.values()];
}

function barberWindowFits(ctx: DayContext, start: number, barberEnd: number): boolean {
  if (!ctx.open) return false;
  if (start < ctx.startMin || barberEnd > ctx.endMin) return false;
  const spans = [
    ...ctx.busy.map((b) => ({ start: b.start, end: b.end })),
    ...ctx.blocked,
  ];
  return !spans.some((b) => overlaps(start, barberEnd, b.start, b.end));
}

/**
 * Lay one attendee's chain out, back-to-back from the shared visit start.
 * `attempt.planBusy` is read for collisions with segments claimed by earlier
 * attendees (two groomsmen can't share one barber at one minute) and updated
 * as spans are taken. Returns null when the chain cannot fit — the caller then
 * looks for nearby starts; a partial visit is never booked.
 */
/** One greedy pass with optional cluster pins (serviceId → barberId). */
function greedyPass(
  attendee: AttendeeRequest,
  attempt: Attempt,
  pins: Map<number, number>,
  clusterOf: Map<number, number>,
  clusters: number[][],
): { segments: VisitSegment[]; clientEnd: number } | null {
  const { data } = attempt;
  const segments: VisitSegment[] = [];
  const mine: { barberId: number; start: number; end: number }[] = [];
  let cursor: number = attempt.startMin; // when the CLIENT is next free
  let previous: VisitSegment | null = null;
  // Barber chosen for a same-barber cluster, learned as the chain is placed.
  const pinned = new Map(pins);

  const releaseMine = () => {
    for (const claim of mine) {
      const list = attempt.planBusy.get(claim.barberId) ?? [];
      const at = list.findIndex((s) => s.start === claim.start && s.end === claim.end);
      if (at >= 0) list.splice(at, 1);
    }
  };

  for (const serviceId of attendee.serviceIds) {
    const cluster = clusterOf.get(serviceId);
    // A pinned barber (explicit choice or learned cluster owner) filters
    // candidates outright — explicit pins can never be overwritten here.
    const clusterBarber: number | undefined = pinned.get(serviceId);
    const options: BarberCandidate[] = (data.candidates.get(`${attendee.attendeeId}:${serviceId}`) ?? [])
      .filter((c) => !attendee.barberId || c.barberId === attendee.barberId)
      .filter((c) => clusterBarber === undefined || c.barberId === clusterBarber);
    // Continuity first: keep the previous barber when the chain allows it.
    const continuityBarber: number | null =
      clusterBarber !== undefined ? clusterBarber : previous ? previous.barberId : null;
    const ordered: BarberCandidate[] =
      continuityBarber === null
        ? options
        : [...options].sort((x, y) =>
            Number(y.barberId === continuityBarber) - Number(x.barberId === continuityBarber));

    let placed: VisitSegment | null = null;
    for (const candidate of ordered) {
      const service: ResolvedService = candidate.service;
      const ctx: DayContext = candidate.ctx;
      // Parallel execution only when BOTH service definitions allow it and the
      // staffing differs; the client then overlaps two services, staff never do.
      const parallel: boolean =
        previous !== null &&
        candidate.barberId !== previous.barberId &&
        service.allowParallel &&
        (data.candidates.get(`${attendee.attendeeId}:${previous.serviceId}`) ?? []).some(
          (p) => p.barberId === previous!.barberId && p.service.allowParallel,
        );
      const start: number = parallel ? previous!.startMin : cursor;
      const barberEnd: number = start + service.barberDurationMin + service.bufferMin;
      const busy = (attempt.planBusy.get(candidate.barberId) ?? []).filter(
        (c) => c.attendeeId !== attendee.attendeeId,
      );
      const windowFree: boolean =
        barberWindowFits(ctx, start, barberEnd) &&
        !busy.some((c) => overlaps(start, barberEnd, c.start, c.end));
      if (!windowFree) continue;
      const clientEnd: number = start + service.durationMin;
      placed = {
        attendeeId: attendee.attendeeId,
        serviceId: service.id,
        serviceName: service.name,
        barberId: candidate.barberId,
        barberName: candidate.barberName,
        barberSlug: candidate.barberSlug,
        date: attempt.date,
        startMin: start,
        barberEndMin: barberEnd,
        clientEndMin: clientEnd,
        durationMin: service.durationMin,
        barberDurationMin: service.barberDurationMin,
        bufferMin: service.bufferMin,
        processingMin: service.processingMin,
        price: service.price,
        paymentMode: service.paymentMode,
        amountDueOnline: service.amountDueOnline,
        remainingDue: service.remainingDue,
        managerApprovalRequired: service.managerApprovalRequired,
      };
      attempt.planBusy.set(candidate.barberId, [
        ...(attempt.planBusy.get(candidate.barberId) ?? []),
        { start, end: barberEnd, attendeeId: attendee.attendeeId },
      ]);
      mine.push({ barberId: candidate.barberId, start, end: barberEnd });
      segments.push(placed);
      if (cluster !== undefined) {
        for (const member of clusters[cluster]) if (!pinned.has(member)) pinned.set(member, candidate.barberId);
      }
      cursor = parallel ? Math.max(cursor, clientEnd, previous!.clientEndMin) : clientEnd;
      previous = placed;
      break;
    }
    if (!placed) {
      releaseMine();
      return null;
    }
  }
  return { segments, clientEnd: cursor };
}

function scheduleAttendee(
  attendee: AttendeeRequest,
  attempt: Attempt,
): { segments: VisitSegment[]; clientEnd: number } | null {
  const { data } = attempt;
  const clusters = sameBarberClusters(attendee.serviceIds, data.rules);
  const clusterOf = new Map<number, number>();
  clusters.forEach((members, index) => {
    for (const member of members) clusterOf.set(member, index);
  });

  // Explicit per-service choices, expanded across same-barber clusters so the
  // whole group inherits its customer-picked barber.
  const explicit = new Map<number, number>();
  for (const pin of attendee.servicePins ?? []) {
    if (!attendee.serviceIds.includes(pin.serviceId)) continue;
    explicit.set(pin.serviceId, pin.barberId);
    const cluster = clusterOf.get(pin.serviceId);
    if (cluster !== undefined) for (const member of clusters[cluster]) explicit.set(member, pin.barberId);
  }

  // Fast path: greedy (honoring explicit pins), cluster learned mid-chain.
  const fast = greedyPass(attendee, attempt, explicit, clusterOf, clusters);
  if (fast) return fast;
  if (clusters.length === 0) return null;

  // Retry: pin shared barbers for the biggest cluster explicitly (e.g. the
  // groom's haircut+beard must land on one barber even when greedy split them).
  // Clusters the customer already pinned are excluded — their barber is fixed.
  const pinnedClusters = clusters.filter((c) => c.length > 1 && !c.some((id) => explicit.has(id)));
  if (pinnedClusters.length === 0) return null;
  const barberSets = pinnedClusters.map((cluster) => {
    const sets = cluster.map((id) =>
      (data.candidates.get(`${attendee.attendeeId}:${id}`) ?? [])
        .filter((c) => !attendee.barberId || c.barberId === attendee.barberId)
        .map((c) => c.barberId),
    );
    const [first, ...rest] = sets;
    return [...new Set(first ?? [])].filter((b) => rest.every((s) => s.includes(b)));
  });
  let combos: Map<number, number>[] = [new Map(explicit)];
  for (let i = 0; i < barberSets.length; i += 1) {
    const next: Map<number, number>[] = [];
    for (const base in combos) {
      void base;
      for (const pin of [...(combos[Number(base)] ?? [])].slice(0, 4)) {
        void pin;
      }
    }
    for (const base of combos) {
      for (const barberId of barberSets[i].slice(0, 6)) {
        const m = new Map(base);
        for (const member of pinnedClusters[i]) m.set(member, barberId);
        next.push(m);
        if (next.length >= 24) break;
      }
    }
    combos = next.length ? next : combos;
    if (combos.length > 32) break;
  }
  for (const pins of combos) {
    if (pins.size === 0) continue;
    const attemptWithPins = greedyPass(attendee, attempt, pins, clusterOf, clusters);
    if (attemptWithPins) return attemptWithPins;
  }
  return null;
}

function pastLimit(data: PlannerData, date: string): number {
  if (date > data.now.date) return -1;
  if (date < data.now.date) return Number.MAX_SAFE_INTEGER;
  return data.now.minute + data.minLeadMin;
}

/** Try to place the whole request at one exact start. */
function tryStart(request: VisitRequest, data: PlannerData, start: number): VisitPlan | null {
  const attempt: Attempt = { date: request.date, startMin: start, data, planBusy: new Map() };
  const segments: VisitSegment[] = [];
  let end = start;
  for (const attendee of request.attendees) {
    const scheduled = scheduleAttendee(attendee, attempt);
    if (!scheduled) return null;
    segments.push(...scheduled.segments);
    end = Math.max(end, scheduled.clientEnd);
  }
  return {
    date: request.date,
    startMin: start,
    endMin: end,
    totalMinutes: end - start,
    segments,
    totalPrice: segments.reduce((sum, s) => sum + s.price, 0),
    amountDueOnline: segments.reduce((sum, s) => sum + s.amountDueOnline, 0),
    remainingDue: segments.reduce((sum, s) => sum + s.remainingDue, 0),
    requiresManagerApproval: segments.some((s) => s.managerApprovalRequired),
    distinctBarbers: new Set(segments.map((s) => s.barberId)).size,
  };
}

/**
 * Main entry. With `startMin` set, validates that exact time against the whole
 * chain (an empty slot at 16:00 is not enough — 16:00–17:30 must all fit) and
 * offers nearby starts on failure. With null, enumerates every start time on
 * the date that hosts the complete visit — this is the customer's time grid.
 */
/** Named occupancy reason for the refused window, when blockers agree. */
function occupancyReason(data: PlannerData, attendees: AttendeeRequest[], start: number): string | null {
  const kinds: ("class" | "blocked" | "hold" | "booking")[] = [];
  let classTitle: string | undefined;
  let sawAny = false;
  for (const attendee of attendees) {
    for (const serviceId of attendee.serviceIds) {
      const candidates = (data.candidates.get(`${attendee.attendeeId}:${serviceId}`) ?? [])
        .filter((c) => !attendee.barberId || c.barberId === attendee.barberId);
      if (candidates.length === 0) return null;
      const span = Math.max(...candidates.map((c) => c.service.barberDurationMin), 30);
      const end = start + span;
      let anyBlockerForService = false;
      for (const c of candidates) {
        const cls = c.ctx.blocked.find((b) => b.kind === "class" && overlaps(start, end, b.start, b.end));
        const bl = !cls && c.ctx.blocked.find((b) => overlaps(start, end, b.start, b.end));
        const busy = cls || bl ? undefined : c.ctx.busy.find((b) => overlaps(start, end, b.start, b.end));
        if (!cls && !bl && !busy) { anyBlockerForService = false; break; }
        anyBlockerForService = true;
        if (cls) { kinds.push("class"); classTitle = classTitle ?? cls.title; }
        else if (bl) kinds.push("blocked");
        else kinds.push(busy!.kind ?? "booking");
      }
      if (!anyBlockerForService) return null;
    }
  }
  if (kinds.length === 0) return null;
  const unanimous = kinds.every((k) => k === kinds[0]);
  if (!unanimous) return null;
  switch (kinds[0]) {
    case "class":
      return classTitle ? `این آرایشگر ساعت درخواستی در کلاس «${classTitle}» است.` : "ساعت درخواستی با کلاس آموزشی آرایشگر تداخل دارد.";
    case "blocked":
      return "این آرایشگر در بازهٔ درخواستی مرخصی یا مسدودی تقویمی دارد.";
    case "hold":
      return "این زمان روی میز مشتری دیگری در حال بررسی است.";
    default:
      return null;
  }
}

export function planVisit(request: VisitRequest, data: PlannerData): PlanOutcome {
  const attendees = request.attendees.filter((a) => a.serviceIds.length > 0);
  if (attendees.length === 0) {
    return {
      plan: null,
      validStarts: [],
      nearby: [],
      issues: [{ code: "EMPTY_SELECTION", message: "حداقل یک خدمت انتخاب کنید." }],
    };
  }

  const issues: PlanIssue[] = [];
  for (const attendee of attendees) {
    issues.push(...selectionIssues(attendee.serviceIds, data.rules, data));
  }
  // Customer-picked barbers per service: a pin only keeps candidates of that
  // barber, so validate (a) the barber actually performs the service and
  // (b) grouped (same-barber) services were not pinned to different people.
  const pinOf = new Map<string, number>();
  for (const attendee of attendees) {
    for (const pin of attendee.servicePins ?? []) {
      if (!attendee.serviceIds.includes(pin.serviceId)) continue;
      pinOf.set(`${attendee.attendeeId}:${pin.serviceId}`, pin.barberId);
      if (attendee.barberId && attendee.barberId !== pin.barberId)
        issues.push({
          code: "PIN_FILTER_CONFLICT",
          message: "آرایشگر انتخابیِ این خدمت با آرایشگر کل نوبت فرق دارد؛ یکی را بردارید.",
          serviceIds: [pin.serviceId],
        });
    }
  }
  for (const attendee of attendees) {
    for (const cluster of sameBarberClusters(attendee.serviceIds, data.rules)) {
      if (cluster.length < 2) continue;
      const picked = new Set(
        cluster
          .map((id) => pinOf.get(`${attendee.attendeeId}:${id}`))
          .filter((b): b is number => b !== undefined),
      );
      if (picked.size > 1)
        issues.push({
          code: "SAME_BARBER_PIN_CONFLICT",
          message: `«${cluster.map((id) => nameOfService(data, id)).join(" و ")}» باید همان یک آرایشگر را داشته باشند؛ برای همهٔ این گروه یک نفر را انتخاب کنید.`,
          serviceIds: cluster,
        });
    }
  }
  for (const attendee of attendees) {
    for (const serviceId of attendee.serviceIds) {
      const pin = pinOf.get(`${attendee.attendeeId}:${serviceId}`);
      const options = (data.candidates.get(`${attendee.attendeeId}:${serviceId}`) ?? [])
        .filter((c) => !attendee.barberId || c.barberId === attendee.barberId)
        .filter((c) => pin === undefined || c.barberId === pin);
      if (options.length === 0) {
        const pinned = pin
          ? data.barberNames?.get(pin)
          : attendee.barberId
            ? data.barberNames?.get(attendee.barberId)
            : undefined;
        issues.push({
          code: "NO_STAFF",
          message: pinned
            ? `${pinned} «${nameOfService(data, serviceId)}» را انجام نمی‌دهد؛ یک آرایشگر دیگر انتخاب کنید.`
            : `برای «${nameOfService(data, serviceId)}» در حال حاضر آرایشگر واجد شرایطی موجود نیست.`,
          serviceIds: [serviceId],
        });
      }
    }
  }
  for (const attendee of attendees) {
    for (const cluster of sameBarberClusters(attendee.serviceIds, data.rules)) {
      if (cluster.length < 2) continue;
      const sets = cluster.map((id) =>
        new Set(
          (data.candidates.get(`${attendee.attendeeId}:${id}`) ?? [])
            .filter((c) => !attendee.barberId || c.barberId === attendee.barberId)
            .map((c) => c.barberId),
        ),
      );
      const [first, ...rest] = sets;
      if (!first) continue;
      const shared = [...first].filter((b) => rest.every((s) => s.has(b)));
      if (shared.length === 0) {
        issues.push({
          code: "SAME_BARBER_UNAVAILABLE",
          message: `«${cluster.map((id) => nameOfService(data, id)).join(" و ")}» فقط با یک آرایشگر قابل رزرو است؛ در حال حاضر آرایشگر مشترکی در دسترس ندارند.`,
          serviceIds: cluster,
        });
      }
    }
  }
  if (issues.length > 0) {
    return { plan: null, validStarts: [], nearby: [], issues };
  }

  const scoped: VisitRequest = { date: request.date, startMin: request.startMin, attendees };
  const limit = pastLimit(data, request.date);

  if (request.startMin !== null) {
    if (limit !== -1 && request.startMin <= limit) {
      return {
        plan: null,
        validStarts: [],
        nearby: [],
        issues: [{ code: "PAST_OR_TOO_LATE", message: "این زمان گذشته است؛ زمان دیگری انتخاب کنید." }],
      };
    }
    const plan = tryStart(scoped, data, request.startMin);
    if (plan) return { plan, validStarts: [request.startMin], nearby: [], issues: [] };
    const nearby: number[] = [];
    for (let s = request.startMin + data.slotStep; s + 30 <= data.gridEndMin && nearby.length < 3; s += data.slotStep) {
      if (limit !== -1 && s <= limit) continue;
      if (tryStart(scoped, data, s)) nearby.push(s);
    }
    return {
      plan: null,
      validStarts: [],
      nearby,
      issues: [
        {
          code: "NO_CAPACITY_AT_TIME",
          message: nearby.length
            ? `${occupancyReason(data, attendees, request.startMin) ?? "این زمان لحظاتی پیش رزرو شد."} نزدیک‌ترین زمان‌ها: ${nearby.map(minutesToLabel).join("، ")}`
            : `ساعت ${minutesToLabel(request.startMin)} برای کل این ترکیب خدمات ظرفیت ندارد. یک روز دیگر را امتحان کنید.`,
        },
      ],
    };
  }

  const validStarts: number[] = [];
  let first: VisitPlan | null = null;
  for (let s = data.gridStartMin; s + 30 <= data.gridEndMin; s += data.slotStep) {
    if (limit !== -1 && s <= limit) continue;
    const plan = tryStart(scoped, data, s);
    if (!plan) continue;
    validStarts.push(s);
    if (!first) first = plan;
  }
  return { plan: first, validStarts, nearby: [], issues: [] };
}
