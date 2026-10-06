/**
 * Visit planner — the single scheduling engine of the salon.
 *
 * A customer visit is ONE appointment-level concept made of one or more service
 * segments. Multi-service and multi-barber scheduling lives here, never in the
 * customer's head and never duplicated per surface: the booking flow, the smart
 * calendar, the server-side revalidation and the tests all call these functions.
 *
 * The module is deliberately free of database imports. Data arrives through the
 * `PlannerDataSource` seam (see `visit-planner-db.ts` for the Drizzle adapter),
 * which keeps the algorithm deterministic and unit-testable while guaranteeing
 * that production and tests run the exact same code path.
 *
 * Rules encoded here:
 * - Only approved capability participates: a barber is eligible when an offer
 *   exists for (barber, service) — the adapter resolves skills, the
 *   barber↔service link and per-barber overrides exactly like booking does.
 * - A plan is a complete chain: every requested service is assigned, the client
 *   timeline is continuous (a later segment never starts before the previous one
 *   ends), and the barber is occupied for `barberDurationMin + bufferMin`.
 * - `durationMin` is the client's time (it already includes processing time);
 *   `barberDurationMin` is the barber's hands-on time.
 * - A start is offered only when the WHOLE visit fits, so a free 11:00 slot is
 *   never shown when the 3-hour chain that follows cannot complete.
 */

import { SLOT_STEP } from "./time";

export type PaymentMode = "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT";

/** Half-open minute interval on a single day: [start, end). */
export type Interval = { start: number; end: number };

export type VisitPreference = "EARLIEST" | "ONE_BARBER" | "PREFERRED_BARBER";

export type VisitBadge =
  | "EARLIEST"
  | "ONE_BARBER"
  | "PREFERRED_BARBER"
  | "TEAM"
  | "NO_WAIT"
  | "PROCESSING";

export type PlannerService = {
  id: number;
  name: string;
  category: string;
};

/** A barber's approved, priced offer for one service. */
export type ServiceOffer = {
  barberId: number;
  serviceId: number;
  /** Client-visible time of the service (includes processing time). */
  durationMin: number;
  /** Time the barber is actively occupied. */
  barberDurationMin: number;
  /** Cleanup/buffer the barber needs after the service. */
  bufferMin: number;
  price: number;
  paymentMode: PaymentMode;
  amountDueOnline: number;
  remainingDue: number;
};

export type PlannerBarber = {
  id: number;
  name: string;
  title: string;
  /** Services this barber may perform, derived from offers. */
  serviceIds: number[];
};

export type BarberDay = {
  barberId: number;
  /** Working windows (salon hours ∩ barber hours), merged. Empty = not working. */
  windows: Interval[];
  /** Bookings and active holds (client-facing "رزرو شده" time), merged. */
  busy: Interval[];
  /**
   * Time the salon removed from sale — leave, training, closed chair. It makes a
   * start unusable exactly like a booking does, but it is kept apart so surfacing
   * layers can say why a slot is gone instead of blaming another customer.
   */
  blocked?: Interval[];
};

/**
 * Every interval the barber is unavailable for, merged.
 *
 * `busy` alone is not enough: blocked time must block planning too, and this is
 * the single place that combination happens, so the planner, the write guard and
 * the slot grid can never disagree about whether a time is free.
 */
export function unavailable(day: BarberDay): Interval[] {
  return day.blocked?.length ? mergeIntervals([day.busy, day.blocked].flat()) : day.busy;
}

export type PlannerDayData = {
  date: string;
  services: PlannerService[];
  barbers: PlannerBarber[];
  offers: ServiceOffer[];
  days: BarberDay[];
  /** Current salon minute when `date` is today, otherwise null. */
  nowMin: number | null;
};

export type VisitPlanStep = {
  serviceId: number;
  serviceName: string;
  barberId: number;
  barberName: string;
  startMin: number;
  /** When the client is free again (start + durationMin). */
  endMin: number;
  /** When the barber is free again (start + barberDurationMin + bufferMin). */
  barberEndMin: number;
  /** Idle time for the client before this segment (0 for the first segment). */
  waitMin: number;
  /** Processing/parallel window inside this segment (durationMin − barberDurationMin). */
  processingMin: number;
};

export type VisitPlan = {
  date: string;
  startMin: number;
  endMin: number;
  /** Total client time, end − start (includes processing and any waiting). */
  durationMin: number;
  steps: VisitPlanStep[];
  /** Distinct barbers in the order they are involved. */
  barberIds: number[];
  barberNames: string[];
  /** True when one barber performs every segment. */
  oneBarber: boolean;
  /** Segments performed by a barber other than the first one. */
  handoffs: number;
  /** Total client idle time inside the visit. */
  waitMin: number;
  /** Longest processing window inside the visit. */
  maxProcessingMin: number;
  price: number;
  amountDueOnline: number;
  remainingDue: number;
  paymentMode: PaymentMode;
  requiredBarberIds: number[];
  preferredBarberSegments: number;
  badges: VisitBadge[];
  rank: number;
};

export type PlanRequest = {
  date: string;
  serviceIds: number[];
  preference?: VisitPreference;
  preferredBarberId?: number | null;
  /** When set with PREFERRED_BARBER the visit may only use that barber. */
  onlyPreferredBarber?: boolean;
  limit?: number;
};

export type DayPlanSummary = {
  date: string;
  /** Number of distinct valid plans found, capped at `summaryCap`. */
  planCount: number;
  /** True when more plans exist than the summary counted. */
  planCountCapped: boolean;
  /** Distinct teams (barber combinations) that can deliver the visit. */
  optionCount: number;
  /** Distinct start times across every team. */
  startCount: number;
  firstStartMin: number | null;
  firstEndMin: number | null;
  oneBarberAvailable: boolean;
  barberNames: string[];
};

/** One concrete start time of a booking option. */
export type VisitOptionStart = {
  startMin: number;
  endMin: number;
  plan: VisitPlan;
};

/**
 * Booking option = one team + the start times it can deliver. This is what the
 * customer actually chooses from: the team is decided by the scheduler, the
 * customer only picks when.
 */
export type VisitOption = {
  key: string;
  barberIds: number[];
  barberNames: string[];
  oneBarber: boolean;
  handoffs: number;
  durationMin: number;
  price: number;
  amountDueOnline: number;
  remainingDue: number;
  paymentMode: PaymentMode;
  badges: VisitBadge[];
  starts: VisitOptionStart[];
  /** True when the option includes the explicitly preferred barber. */
  includesPreferredBarber: boolean;
};

export type NoPlanReason =
  | "NO_SERVICE_SELECTED"
  | "UNKNOWN_SERVICE"
  | "NO_CAPABLE_BARBER"
  | "PREFERRED_BARBER_INCAPABLE"
  | "SALON_CLOSED"
  | "OUTSIDE_HOURS"
  | "TOO_SHORT_WINDOW"
  | "TIME_PASSED"
  | "BUSY_DAY";

export type NoPlanExplanation = { reason: NoPlanReason; message: string };

export type PlannerDataSource = {
  today(): string;
  nowMinuteOfDay(): number;
  /** Everything the planner needs for one date, in batched queries. */
  loadDay(date: string): Promise<PlannerDayData>;
};

export type VisitValidationItem = {
  attendeeId?: string;
  barberId: number;
  serviceId: number;
  date: string;
  startMin: number;
};

export type VisitValidationResult =
  | { ok: true }
  | { ok: false; error: string; conflictStartMin?: number };

/* ------------------------------------------------------------------ *
 * Interval helpers
 * ------------------------------------------------------------------ */

export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  // Copy on the way in: callers hand over live day snapshots, and merging must
  // never widen an interval inside the caller's own array.
  const merged: Interval[] = [{ ...sorted[0] }];
  for (const current of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (current.start <= last.end) last.end = Math.max(last.end, current.end);
    else merged.push({ ...current });
  }
  return merged;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Snaps a minute to the shared scheduling grid. */
export function snapToGrid(minute: number): number {
  return Math.ceil(minute / SLOT_STEP) * SLOT_STEP;
}

/**
 * Earliest minute ≥ `from` where `[t, t + need)` is inside one working window and
 * free of every busy interval. `busy` must be sorted and merged.
 */
export function earliestFreeStart(
  windows: Interval[],
  busy: Interval[],
  from: number,
  need: number,
): number | null {
  if (need <= 0) return null;
  for (const window of windows) {
    let t = Math.max(from, window.start);
    // Bounded fixed-point loop: snap to the grid, then jump past every clash.
    for (let guard = 0; guard < 64; guard += 1) {
      if (t < window.start) t = window.start;
      if (t % SLOT_STEP !== 0) t = snapToGrid(t);
      if (t + need > window.end) break;
      const clash = busy.find((block) => overlaps({ start: t, end: t + need }, block));
      if (clash) {
        t = clash.end;
        continue;
      }
      return t;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Search space helpers
 * ------------------------------------------------------------------ */

function permutations(count: number, cap: number): number[][] {
  const items = Array.from({ length: count }, (_, index) => index);
  if (count <= 1) return [items];
  const result: number[][] = [];
  const walk = (prefix: number[], rest: number[]) => {
    if (result.length >= cap) return;
    if (rest.length === 0) {
      result.push(prefix);
      return;
    }
    for (let index = 0; index < rest.length; index += 1) {
      walk([...prefix, rest[index]], [...rest.slice(0, index), ...rest.slice(index + 1)]);
      if (result.length >= cap) return;
    }
  };
  walk([], items);
  return result;
}

/** Service orders worth exploring. Small visits get every ordering. */
export function candidateOrders(count: number): number[][] {
  if (count <= 1) return [Array.from({ length: count }, (_, index) => index)];
  if (count <= 4) return permutations(count, 24);
  const base = Array.from({ length: count }, (_, index) => index);
  return [
    base,
    [...base].reverse(),
    [...base].sort((a, b) => a - b),
    [...base].slice().sort((a, b) => (b % 3) - (a % 3)),
  ];
}

function buildBusyIndex(days: BarberDay[]): Map<number, Interval[]> {
  const index = new Map<number, Interval[]>();
  for (const day of days) index.set(day.barberId, mergeIntervals(unavailable(day)));
  return index;
}

/* ------------------------------------------------------------------ *
 * Core: plan every valid visit on one date
 * ------------------------------------------------------------------ */

const MAX_SIMULATIONS = 90_000;
const MAX_START_CANDIDATES = 14;
/**
 * Largest acceptable idle gap inside one visit. A customer should not be parked
 * in the salon for an hour because two isolated free slots looked promising:
 * minor handover waits are fine, holes are not. Processing time lives inside a
 * service duration, not in this budget.
 */
const MAX_VISIT_WAIT_MIN = SLOT_STEP;
/** Long visits may accumulate a little snapping drift between segments. */
const MAX_VISIT_WAIT_RATIO = 0.15;
/** Raw plans kept per date before grouping; enough to cover every team + start. */
const DEFAULT_PLAN_POOL = 24;

export type PlanDayOptions = {
  preference?: VisitPreference;
  preferredBarberId?: number | null;
  onlyPreferredBarber?: boolean;
  limit?: number;
};

/**
 * Every valid complete visit on a single date, ranked for the given preference.
 * Returns an empty array when no complete visit exists — never a partial visit.
 */
export function planVisitForDay(
  data: PlannerDayData,
  serviceIds: number[],
  options: PlanDayOptions = {},
): VisitPlan[] {
  const preference = options.preference ?? "EARLIEST";
  const limit = options.limit ?? DEFAULT_PLAN_POOL;
  const requested = [...new Set(serviceIds)];
  const services = requested
    .map((id) => data.services.find((service) => service.id === id))
    .filter((service): service is PlannerService => Boolean(service));
  if (services.length === 0 || services.length !== requested.length) return [];

  const dayWindows = new Map<number, Interval[]>();
  for (const day of data.days) dayWindows.set(day.barberId, mergeIntervals(day.windows));

  let offers = data.offers.filter((offer) => requested.includes(offer.serviceId));
  if (options.onlyPreferredBarber && options.preferredBarberId) {
    offers = offers.filter((offer) => offer.barberId === options.preferredBarberId);
  }

  const offerMap = new Map<string, ServiceOffer>();
  for (const offer of offers) offerMap.set(`${offer.serviceId}:${offer.barberId}`, offer);

  const barberNames = new Map<number, string>();
  for (const barber of data.barbers) barberNames.set(barber.id, barber.name);

  // A service nobody can perform makes the whole visit impossible.
  const eligibleBarbersPerService = services.map((service) =>
    [...new Set(offers.filter((offer) => offer.serviceId === service.id).map((offer) => offer.barberId))].filter(
      (barberId) => (dayWindows.get(barberId)?.length ?? 0) > 0,
    ),
  );
  if (eligibleBarbersPerService.some((list) => list.length === 0)) return [];

  const busyIndex = buildBusyIndex(data.days);
  const minStart = data.nowMin ?? 0;

  const startCandidates = collectStartCandidates(
    barberNames,
    dayWindows,
    busyIndex,
    eligibleBarbersPerService,
    minStart,
    services.length,
  );
  if (startCandidates.length === 0) return [];

  // Team assignments, ordered so the plans a customer is most likely to want are
  // simulated first: fewest distinct barbers, then the preferred barber, then
  // the earliest-capable barber. A budget cap then degrades gracefully.
  const teams = buildTeams(
    eligibleBarbersPerService,
    options.preferredBarberId ?? null,
    offerMap,
    services,
  );

  const orders = candidateOrders(services.length);
  const plans: VisitPlan[] = [];
  const seen = new Set<string>();
  let simulations = 0;

  outer: for (const startMin of startCandidates) {
    for (const order of orders) {
      for (const team of teams) {
        if (simulations >= MAX_SIMULATIONS) break outer;
        simulations += 1;
        const plan = simulateVisit({
          data,
          services,
          offerMap,
          order,
          team,
          startMin,
          dayWindows,
          busyIndex,
          barberNames,
        });
        if (!plan) continue;
        const signature = planSignature(plan);
        if (seen.has(signature)) continue;
        seen.add(signature);
        plans.push(plan);
      }
    }
    if (plans.length >= Math.max(limit, 12)) break;
  }

  return rankVisitPlans(plans, {
    preference,
    preferredBarberId: options.preferredBarberId ?? null,
    limit,
  });
}

/**
 * Resource signature: two plans with the same window, the same team and the same
 * service→barber assignment are the same booking, whatever order the search
 * simulated them in.
 */
function planSignature(plan: VisitPlan): string {
  const assignment = plan.steps
    .map((step) => `${step.serviceId}@${step.barberId}`)
    .sort()
    .join(",");
  return `${plan.date}|${plan.startMin}|${plan.endMin}|${plan.barberIds.join("+")}|${assignment}`;
}

function collectStartCandidates(
  barberNames: Map<number, string>,
  dayWindows: Map<number, Interval[]>,
  busyIndex: Map<number, Interval[]>,
  eligibleBarbersPerService: number[][],
  minStart: number,
  serviceCount: number,
): number[] {
  void barberNames;
  void serviceCount;
  const eligible = [...new Set(eligibleBarbersPerService.flat())];
  const candidates = new Set<number>();
  for (const barberId of eligible) {
    const windows = dayWindows.get(barberId) ?? [];
    const busy = busyIndex.get(barberId) ?? [];
    for (const window of windows) {
      let t = Math.max(window.start, minStart);
      for (let guard = 0; guard < 120; guard += 1) {
        const start = earliestFreeStart([window], busy, t, SLOT_STEP);
        if (start === null || start + SLOT_STEP > window.end) break;
        candidates.add(start);
        t = start + SLOT_STEP;
      }
    }
  }
  const ordered = [...candidates].filter((minute) => minute >= minStart).sort((a, b) => a - b);
  if (ordered.length <= MAX_START_CANDIDATES) return ordered;
  // Keep the earliest starts plus a spread across the day so a later one-barber
  // plan is still discovered when the morning is fragmented.
  const stride = Math.ceil(ordered.length / MAX_START_CANDIDATES);
  return ordered.filter((_, index) => index % stride === 0).slice(0, MAX_START_CANDIDATES);
}

function buildTeams(
  eligibleBarbersPerService: number[][],
  preferredBarberId: number | null,
  offerMap: Map<string, ServiceOffer>,
  services: PlannerService[],
): number[][] {
  const lists = eligibleBarbersPerService.map((barbers, index) =>
    [...barbers].sort((a, b) => {
      if (preferredBarberId) {
        if (a === preferredBarberId && b !== preferredBarberId) return -1;
        if (b === preferredBarberId && a !== preferredBarberId) return 1;
      }
      const costA = offerMap.get(`${services[index].id}:${a}`);
      const costB = offerMap.get(`${services[index].id}:${b}`);
      return (costA?.barberDurationMin ?? 0) - (costB?.barberDurationMin ?? 0) || a - b;
    }),
  );

  const teams: number[][] = [];
  const walk = (index: number, prefix: number[]) => {
    if (teams.length >= 600) return;
    if (index === lists.length) {
      teams.push(prefix);
      return;
    }
    for (const barberId of lists[index]) walk(index + 1, [...prefix, barberId]);
  };
  walk(0, []);

  const distinct = (team: number[]) => new Set(team).size;
  const preferredSegments = (team: number[]) =>
    preferredBarberId ? team.filter((barberId) => barberId === preferredBarberId).length : 0;
  teams.sort((a, b) => {
    if (preferredBarberId) {
      const preferredDiff = preferredSegments(b) - preferredSegments(a);
      if (preferredDiff !== 0) return preferredDiff;
    }
    return distinct(a) - distinct(b) || a.join(",").localeCompare(b.join(","));
  });
  return teams;
}

function simulateVisit(input: {
  data: PlannerDayData;
  services: PlannerService[];
  offerMap: Map<string, ServiceOffer>;
  order: number[];
  team: number[];
  startMin: number;
  dayWindows: Map<number, Interval[]>;
  busyIndex: Map<number, Interval[]>;
  barberNames: Map<number, string>;
}): VisitPlan | null {
  const { data, services, offerMap, order, team, startMin, dayWindows, barberNames } = input;
  const busy = new Map<number, Interval[]>();
  for (const [barberId, intervals] of input.busyIndex) busy.set(barberId, [...intervals]);

  const steps: VisitPlanStep[] = [];
  let cursor = startMin;
  let price = 0;
  let amountDueOnline = 0;
  let remainingDue = 0;
  let paymentMode: PaymentMode = "NO_PAYMENT";
  let waitMin = 0;
  let maxProcessingMin = 0;

  for (const serviceIndex of order) {
    const service = services[serviceIndex];
    const barberId = team[serviceIndex];
    const offer = offerMap.get(`${service.id}:${barberId}`);
    if (!offer) return null;
    const windows = dayWindows.get(barberId) ?? [];
    if (windows.length === 0) return null;

    const need = offer.barberDurationMin + offer.bufferMin;
    const barberBusy = busy.get(barberId) ?? [];
    const start = earliestFreeStart(windows, barberBusy, cursor, need);
    if (start === null) return null;
    if (data.nowMin !== null && start < data.nowMin) return null;

    const barberEndMin = start + need;
    const endMin = start + offer.durationMin;
    barberBusy.push({ start, end: barberEndMin });
    barberBusy.sort((a, b) => a.start - b.start);
    busy.set(barberId, barberBusy);

    // Only gaps *inside* the visit count as waiting: a first segment that simply
    // starts later is a later start, not dead time in the salon.
    const gap = steps.length === 0 ? 0 : Math.max(0, start - cursor);
    steps.push({
      serviceId: service.id,
      serviceName: service.name,
      barberId,
      barberName: barberNames.get(barberId) ?? "",
      startMin: start,
      endMin,
      barberEndMin,
      waitMin: gap,
      processingMin: Math.max(0, offer.durationMin - offer.barberDurationMin),
    });
    waitMin += gap;
    maxProcessingMin = Math.max(maxProcessingMin, Math.max(0, offer.durationMin - offer.barberDurationMin));
    price += offer.price;
    amountDueOnline += offer.amountDueOnline;
    remainingDue += offer.remainingDue;
    if (offer.paymentMode === "FULL_PAYMENT") paymentMode = "FULL_PAYMENT";
    else if (offer.paymentMode === "DEPOSIT" && paymentMode !== "FULL_PAYMENT") paymentMode = "DEPOSIT";
    cursor = endMin;
  }

  if (steps.length !== services.length) return null;
  const clientTotal = steps.reduce((sum, step) => sum + (step.endMin - step.startMin), 0);
  const waitBudget = Math.max(MAX_VISIT_WAIT_MIN, Math.ceil(clientTotal * MAX_VISIT_WAIT_RATIO));
  if (steps.some((step) => step.waitMin > MAX_VISIT_WAIT_MIN)) return null;
  if (waitMin > waitBudget) return null;

  const visitStart = steps[0].startMin;
  const barberIds = [...new Set(steps.map((step) => step.barberId))];
  return {
    date: data.date,
    startMin: visitStart,
    endMin: cursor,
    durationMin: cursor - visitStart,
    steps,
    barberIds,
    barberNames: barberIds.map((id) => barberNames.get(id) ?? ""),
    oneBarber: barberIds.length === 1,
    handoffs: countHandoffs(steps),
    waitMin,
    maxProcessingMin,
    price,
    amountDueOnline,
    remainingDue,
    paymentMode: amountDueOnline > 0 ? paymentMode : "NO_PAYMENT",
    requiredBarberIds: barberIds,
    preferredBarberSegments: 0,
    badges: [],
    rank: 0,
  };
}

function countHandoffs(steps: VisitPlanStep[]): number {
  let handoffs = 0;
  for (let index = 1; index < steps.length; index += 1) {
    if (steps[index].barberId !== steps[index - 1].barberId) handoffs += 1;
  }
  return handoffs;
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

export function rankVisitPlans(
  plans: VisitPlan[],
  options: { preference?: VisitPreference; preferredBarberId?: number | null; limit?: number } = {},
): VisitPlan[] {
  const preference = options.preference ?? "EARLIEST";
  const preferredBarberId = options.preferredBarberId ?? null;
  const limit = options.limit ?? 8;

  const enriched = plans.map((plan) => ({
    ...plan,
    preferredBarberSegments: preferredBarberId
      ? plan.steps.filter((step) => step.barberId === preferredBarberId).length
      : 0,
  }));

  enriched.sort((a, b) => comparePlans(a, b, preference));

  // Badges are attached after sorting so "زودترین" always describes the first
  // option the customer sees, not an arbitrary simulation result.
  return enriched.slice(0, limit).map((plan, index) => ({
    ...plan,
    rank: index,
    badges: badgesFor(plan, index, preference, preferredBarberId),
  }));
}

function comparePlans(a: VisitPlan, b: VisitPlan, preference: VisitPreference): number {
  if (preference === "PREFERRED_BARBER") {
    const preferredDiff = b.preferredBarberSegments - a.preferredBarberSegments;
    if (preferredDiff !== 0) return preferredDiff;
  }
  if (preference === "ONE_BARBER") {
    const barberDiff = a.barberIds.length - b.barberIds.length;
    if (barberDiff !== 0) return barberDiff;
  }
  const waitDiff = a.waitMin - b.waitMin;
  const handoffDiff = a.handoffs - b.handoffs;
  const startDiff = a.startMin - b.startMin;
  const barberCountDiff = a.barberIds.length - b.barberIds.length;
  const endDiff = a.endMin - b.endMin;

  if (preference === "EARLIEST") {
    return startDiff || waitDiff || barberCountDiff || handoffDiff || endDiff;
  }
  return barberCountDiff || handoffDiff || waitDiff || startDiff || endDiff;
}

function badgesFor(
  plan: VisitPlan,
  index: number,
  preference: VisitPreference,
  preferredBarberId: number | null,
): VisitBadge[] {
  const badges: VisitBadge[] = [];
  if (index === 0) badges.push("EARLIEST");
  if (preferredBarberId && plan.steps.every((step) => step.barberId === preferredBarberId))
    badges.push("PREFERRED_BARBER");
  if (plan.oneBarber) badges.push("ONE_BARBER");
  else if (plan.barberIds.length > 1) badges.push("TEAM");
  if (plan.waitMin <= SLOT_STEP && plan.barberIds.length === 1) badges.push("NO_WAIT");
  if (plan.maxProcessingMin > 0) badges.push("PROCESSING");
  void preference;
  return badges;
}

/* ------------------------------------------------------------------ *
 * Day summaries for the smart calendar
 * ------------------------------------------------------------------ */

export function summarizeDay(
  data: PlannerDayData,
  serviceIds: number[],
  options: PlanDayOptions & { summaryCap?: number } = {},
): DayPlanSummary {
  const { summaryCap = 12, ...dayOptions } = options;
  const plans = planVisitForDay(data, serviceIds, { ...dayOptions, limit: summaryCap });
  const first = plans[0] ?? null;
  return {
    date: data.date,
    planCount: plans.length,
    planCountCapped: plans.length >= summaryCap,
    optionCount: groupVisitPlans(plans, { optionsLimit: summaryCap }).length,
    startCount: new Set(plans.map((plan) => plan.startMin)).size,
    firstStartMin: first?.startMin ?? null,
    firstEndMin: first?.endMin ?? null,
    oneBarberAvailable: plans.some((plan) => plan.oneBarber),
    barberNames: first?.barberNames ?? [],
  };
}

/**
 * Turns ranked plans into the option list the customer sees. Four start times per
 * team is enough to choose from without turning the screen into a grid of raw
 * slot buttons, and every returned start carries its fully-resolved plan so the
 * review step and the server submit the exact same visit.
 */
export function groupVisitPlans(
  plans: VisitPlan[],
  options: { optionsLimit?: number; startsPerOption?: number; preferredBarberId?: number | null } = {},
): VisitOption[] {
  const optionsLimit = options.optionsLimit ?? 4;
  const startsPerOption = options.startsPerOption ?? 4;
  const groups = new Map<string, VisitPlan[]>();
  const order: string[] = [];

  for (const plan of plans) {
    const key = plan.barberIds.join(">");
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(plan);
  }

  // The first plan of each group already carries the group's badges (the ranking
  // ran before grouping), and groups keep the order of their best plan.
  const built: VisitOption[] = order.map((key) => {
    const groupPlans = (groups.get(key) ?? []).slice().sort((a, b) => a.startMin - b.startMin);
    const lead = groupPlans[0];
    const starts: VisitOptionStart[] = groupPlans
      .slice(0, startsPerOption)
      .map((plan) => ({ startMin: plan.startMin, endMin: plan.endMin, plan }));
    return {
      key,
      barberIds: lead.barberIds,
      barberNames: lead.barberNames,
      oneBarber: lead.oneBarber,
      handoffs: lead.handoffs,
      durationMin: lead.durationMin,
      price: lead.price,
      amountDueOnline: lead.amountDueOnline,
      remainingDue: lead.remainingDue,
      paymentMode: lead.paymentMode,
      badges: lead.badges,
      starts,
      includesPreferredBarber: options.preferredBarberId
        ? lead.barberIds.includes(options.preferredBarberId)
        : false,
    };
  });

  built.sort((a, b) => {
    const rankA = plans.find((plan) => plan.barberIds.join(">") === a.key)?.rank ?? 0;
    const rankB = plans.find((plan) => plan.barberIds.join(">") === b.key)?.rank ?? 0;
    return rankA - rankB || a.starts[0].startMin - b.starts[0].startMin;
  });

  return built.slice(0, optionsLimit);
}

/**
 * Why a date has no plan — phrased for the customer, not for the scheduler.
 * The UI pairs this with the nearest alternative dates.
 */
export function explainEmptyDay(
  data: PlannerDayData,
  serviceIds: number[],
  options: { preferredBarberId?: number | null; onlyPreferredBarber?: boolean } = {},
): NoPlanExplanation {
  const requested = [...new Set(serviceIds)];
  if (requested.length === 0)
    return { reason: "NO_SERVICE_SELECTED", message: "برای شروع، یک یا چند خدمت انتخاب کنید." };

  const known = requested.filter((id) => data.services.some((service) => service.id === id));
  if (known.length !== requested.length)
    return { reason: "UNKNOWN_SERVICE", message: "یکی از خدمت‌های انتخاب‌شده دیگر فعال نیست؛ انتخاب خود را به‌روز کنید." };

  if (options.onlyPreferredBarber && options.preferredBarberId) {
    const incapable = requested.filter(
      (id) => !data.offers.some((offer) => offer.serviceId === id && offer.barberId === options.preferredBarberId),
    );
    if (incapable.length > 0)
      return {
        reason: "PREFERRED_BARBER_INCAPABLE",
        message: "آرایشگر انتخابی همهٔ خدمت‌های این نوبت را انجام نمی‌دهد؛ یا قید «فقط این آرایشگر» را بردارید یا خدمت‌ها را تغییر دهید.",
      };
  }

  const able = requested.filter((id) => data.offers.some((offer) => offer.serviceId === id));
  if (able.length !== requested.length)
    return {
      reason: "NO_CAPABLE_BARBER",
      message: "در حال حاضر آرایشگر واجد شرایطی برای یکی از خدمت‌های انتخابی وجود ندارد.",
    };

  const openDays = data.days.filter((day) => day.windows.length > 0);
  if (openDays.length === 0)
    return { reason: "SALON_CLOSED", message: "سالن در این روز تعطیل است؛ روز دیگری را انتخاب کنید." };

  const today = data.nowMin !== null;
  if (today) {
    const anyWindowLeft = openDays.some((day) => day.windows.some((window) => window.end > (data.nowMin ?? 0)));
    if (!anyWindowLeft)
      return {
        reason: "TIME_PASSED",
        message: "ساعت کاری این روز تمام شده است؛ نزدیک‌ترین زمان‌های بعدی را ببینید.",
      };
  }

  const totalClient = requested.reduce(
    (sum, id) => sum + (data.offers.find((offer) => offer.serviceId === id)?.durationMin ?? 0),
    0,
  );
  const widest = Math.max(
    0,
    ...openDays.map((day) =>
      day.windows.reduce((best, window) => Math.max(best, window.end - window.start), 0),
    ),
  );
  if (totalClient > widest)
    return {
      reason: "TOO_SHORT_WINDOW",
      message: "ساعت کاری این روز برای انجام کامل این خدمات کوتاه است؛ روز دیگری را انتخاب کنید.",
    };

  return {
    reason: "BUSY_DAY",
    message: "در این روز زمان مناسبی برای انجام کامل این خدمات وجود ندارد.",
  };
}

/* ------------------------------------------------------------------ *
 * Server-side revalidation
 * ------------------------------------------------------------------ */

/**
 * Re-checks a concrete list of segments against live data. Booking creation and
 * hold creation both call this, so a plan the browser saw is validated by the
 * same rules that produced it. Client-supplied times are never trusted.
 */
export async function validateVisitItems(
  source: PlannerDataSource,
  items: VisitValidationItem[],
): Promise<VisitValidationResult> {
  if (items.length === 0) return { ok: false, error: "خدمتی برای رزرو انتخاب نشده است." };
  const dates = [...new Set(items.map((item) => item.date))];
  const loaded = new Map<string, PlannerDayData>();
  for (const date of dates) loaded.set(date, await source.loadDay(date));

  const attendeeWindows = new Map<string, Interval[]>();

  for (const item of items) {
    const data = loaded.get(item.date);
    if (!data) return { ok: false, error: "تاریخ انتخابی معتبر نیست." };

    const offer = data.offers.find(
      (candidate) => candidate.serviceId === item.serviceId && candidate.barberId === item.barberId,
    );
    if (!offer)
      return { ok: false, error: "این خدمت توسط آرایشگر انتخاب‌شده ارائه نمی‌شود؛ زمان دیگری را انتخاب کنید." };

    const day = data.days.find((candidate) => candidate.barberId === item.barberId);
    if (!day || day.windows.length === 0)
      return { ok: false, error: "آرایشگر در این تاریخ کار نمی‌کند؛ آرایشگر یا روز دیگری را انتخاب کنید." };

    const need = offer.barberDurationMin + offer.bufferMin;
    const barberWindow: Interval = { start: item.startMin, end: item.startMin + need };
    const insideWindow = day.windows.some(
      (window) => barberWindow.start >= window.start && barberWindow.end <= window.end,
    );
    if (!insideWindow)
      return { ok: false, error: "این زمان خارج از ساعت کاری آرایشگر است؛ زمان دیگری را انتخاب کنید." };

    if (item.startMin % SLOT_STEP !== 0)
      return { ok: false, error: "زمان انتخابی معتبر نیست؛ زمان‌ها را دوباره بررسی کنید." };

    if (data.nowMin !== null && item.startMin < data.nowMin)
      return { ok: false, error: "این زمان گذشته است؛ نزدیک‌ترین زمان‌های بعدی را ببینید." };

    if (unavailable(day).some((block) => overlaps(barberWindow, block)))
      return { ok: false, error: "این زمان همین الان رزرو شد؛ نزدیک‌ترین زمان‌های دیگر را ببینید.", conflictStartMin: item.startMin };

    const attendeeKey = `${item.attendeeId ?? "primary"}:${item.date}`;
    const clientWindow: Interval = { start: item.startMin, end: item.startMin + offer.durationMin };
    const existing = attendeeWindows.get(attendeeKey) ?? [];
    if (existing.some((block) => overlaps(clientWindow, block)))
      return { ok: false, error: "برای یک نفر نمی‌توان دو خدمت هم‌زمان رزرو کرد؛ ترتیب خدمات را تغییر دهید." };
    existing.push(clientWindow);
    attendeeWindows.set(attendeeKey, existing);

    // Reserve the resources in the local snapshot so later items in the same
    // request are validated against the visit being built, not only against the DB.
    day.busy = mergeIntervals([...unavailable(day), barberWindow]);
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Data-source driven entry points
 * ------------------------------------------------------------------ */

export type PlanDayResult = {
  date: string;
  plans: VisitPlan[];
  options: VisitOption[];
  explanation: NoPlanExplanation | null;
};

export async function planVisitDay(
  source: PlannerDataSource,
  request: PlanRequest,
): Promise<PlanDayResult> {
  const data = await source.loadDay(request.date);
  const plans = planVisitForDay(data, request.serviceIds, request);
  return {
    date: request.date,
    plans,
    options: groupVisitPlans(plans, {
      optionsLimit: request.limit ?? 4,
      preferredBarberId: request.preferredBarberId ?? null,
    }),
    explanation:
      plans.length === 0
        ? explainEmptyDay(data, request.serviceIds, {
            preferredBarberId: request.preferredBarberId ?? null,
            onlyPreferredBarber: request.onlyPreferredBarber,
          })
        : null,
  };
}

export type CalendarRequest = {
  serviceIds: number[];
  preference?: VisitPreference;
  preferredBarberId?: number | null;
  onlyPreferredBarber?: boolean;
  from: string;
  days: number;
};

export type CalendarDay = DayPlanSummary;

/**
 * Bounded, server-side calendar scan. Days are summarised one at a time so the
 * caller can stream or cache partial windows without recomputing everything.
 */
export async function planCalendar(
  source: PlannerDataSource,
  request: CalendarRequest,
): Promise<CalendarDay[]> {
  const days: CalendarDay[] = [];
  const horizon = Math.min(Math.max(request.days, 1), 21);
  for (let index = 0; index < horizon; index += 1) {
    const date = addDays(request.from, index);
    const data = await source.loadDay(date);
    days.push(
      summarizeDay(data, request.serviceIds, {
        preference: request.preference,
        preferredBarberId: request.preferredBarberId,
        onlyPreferredBarber: request.onlyPreferredBarber,
      }),
    );
  }
  return days;
}

/** Returns the first date in `days` that has at least one valid plan. */
export function nearestOpenDay(days: CalendarDay[]): CalendarDay | null {
  return days.find((day) => day.planCount > 0) ?? null;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
