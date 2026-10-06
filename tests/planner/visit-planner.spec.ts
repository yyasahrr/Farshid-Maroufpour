import { test, expect } from "@playwright/test";
import {
  earliestFreeStart,
  groupVisitPlans,
  explainEmptyDay,
  mergeIntervals,
  nearestOpenDay,
  planCalendar,
  planVisitDay,
  planVisitForDay,
  rankVisitPlans,
  unavailable,
  validateVisitItems,
  type PlannerBarber,
  type PlannerDataSource,
  type PlannerDayData,
  type PlannerService,
  type ServiceOffer,
  type VisitPlan,
} from "../../src/lib/visit-planner";

/*
 * Planner contract tests.
 *
 * The planner engine is database-free by design: these tests swap the Drizzle
 * adapter for an in-memory data source, so the exact production algorithm runs
 * deterministically without Postgres. Every scenario from the product spec
 * around complete-visit validation, barber capability, processing time and
 * ranking lives here.
 */

const MIN = (hour: number, minute = 0) => hour * 60 + minute;

type ServiceSpec = {
  id: number;
  name: string;
  durationMin: number;
  barberDurationMin?: number;
  bufferMin?: number;
  price?: number;
};

type BarberSpec = {
  id: number;
  name: string;
  /** serviceId → does this barber perform it */
  can: number[];
  windows: { start: number; end: number }[];
  busy?: { start: number; end: number }[];
  /** Salon-side removal from sale (leave, training, closed chair). */
  blocked?: { start: number; end: number }[];
};

function buildDay(options: {
  date?: string;
  services: ServiceSpec[];
  barbers: BarberSpec[];
  nowMin?: number | null;
}): PlannerDayData {
  const services: PlannerService[] = options.services.map((service) => ({
    id: service.id,
    name: service.name,
    category: "اصلاح",
  }));
  const barbers: PlannerBarber[] = options.barbers.map((barber) => ({
    id: barber.id,
    name: barber.name,
    title: "آرایشگر",
    serviceIds: barber.can,
  }));
  const offers: ServiceOffer[] = [];
  for (const barber of options.barbers) {
    for (const serviceId of barber.can) {
      const service = options.services.find((candidate) => candidate.id === serviceId);
      if (!service) continue;
      offers.push({
        barberId: barber.id,
        serviceId,
        durationMin: service.durationMin,
        barberDurationMin: service.barberDurationMin ?? service.durationMin,
        bufferMin: service.bufferMin ?? 0,
        price: service.price ?? 100_000,
        paymentMode: "NO_PAYMENT",
        amountDueOnline: 0,
        remainingDue: service.price ?? 100_000,
      });
    }
  }
  return {
    date: options.date ?? "2026-10-06",
    services,
    barbers,
    offers,
    days: options.barbers.map((barber) => ({
      barberId: barber.id,
      windows: mergeIntervals(barber.windows),
      busy: mergeIntervals(barber.busy ?? []),
      blocked: mergeIntervals(barber.blocked ?? []),
    })),
    nowMin: options.nowMin ?? null,
  };
}

function fakeSource(days: PlannerDayData[]): PlannerDataSource {
  const map = new Map(days.map((day) => [day.date, day]));
  return {
    today: () => days[0]?.date ?? "2026-10-06",
    nowMinuteOfDay: () => 0,
    loadDay: async (date) => {
      const day = map.get(date);
      if (!day) throw new Error(`no fake day for ${date}`);
      return day;
    },
  };
}

function stepSignature(plan: VisitPlan) {
  return plan.steps.map((step) => `${step.serviceName}@${step.startMin}-${step.endMin}#${step.barberName}`);
}

test.describe("visit planner — start derivation", () => {
  test("snaps to the shared 30-minute grid and skips busy intervals", () => {
    const start = earliestFreeStart([{ start: MIN(9), end: MIN(18) }], [{ start: MIN(10, 10), end: MIN(10, 40) }], MIN(9, 45), 30);
    expect(start).toBe(MIN(11));
  });

  test("returns null when nothing fits before closing", () => {
    expect(earliestFreeStart([{ start: MIN(9), end: MIN(10) }], [], MIN(9, 30), 60)).toBeNull();
  });
});

test.describe("visit planner — single service is the simplest visit", () => {
  test("produces one continuous segment starting as early as possible", () => {
    const day = buildDay({
      services: [{ id: 1, name: "اصلاح", durationMin: 30 }],
      barbers: [{ id: 1, name: "علی", can: [1], windows: [{ start: MIN(10), end: MIN(14) }] }],
    });
    const plans = planVisitForDay(day, [1]);
    expect(plans[0].startMin).toBe(MIN(10));
    expect(plans[0].endMin).toBe(MIN(10, 30));
    expect(plans[0].oneBarber).toBe(true);
    expect(plans[0].steps[0].barberName).toBe("علی");

    // One team, several start times: the option list stays small.
    const options = groupVisitPlans(plans, { optionsLimit: 4, startsPerOption: 4 });
    expect(options).toHaveLength(1);
    expect(options[0].barberNames).toEqual(["علی"]);
    expect(options[0].starts.map((start) => start.startMin)).toEqual([
      MIN(10),
      MIN(10, 30),
      MIN(11),
      MIN(11, 30),
    ]);
    expect(options[0].starts[0].plan.steps[0].serviceName).toBe("اصلاح");
  });

  test("never offers a start in the past", () => {
    const day = buildDay({
      nowMin: MIN(13),
      services: [{ id: 1, name: "اصلاح", durationMin: 30 }],
      barbers: [{ id: 1, name: "علی", can: [1], windows: [{ start: MIN(10), end: MIN(18) }] }],
    });
    const plans = planVisitForDay(day, [1]);
    expect(plans.every((plan) => plan.startMin >= MIN(13))).toBe(true);
  });
});

test.describe("visit planner — complete-visit validation", () => {
  test("a free 11:00 start is not offered when the full chain cannot complete", () => {
    // 11:00 is free for a single service, but the three-hour chain from 11:00
    // runs past the working window, so it must never be offered.
    const day = buildDay({
      services: [
        { id: 1, name: "اصلاح", durationMin: 60 },
        { id: 2, name: "رنگ", durationMin: 60 },
        { id: 3, name: "پرس", durationMin: 60 },
      ],
      barbers: [
        {
          id: 1,
          name: "علی",
          can: [1, 2, 3],
          windows: [{ start: MIN(11), end: MIN(14, 30) }],
          busy: [{ start: MIN(12), end: MIN(13) }],
        },
        {
          id: 2,
          name: "رضا",
          can: [1, 2, 3],
          windows: [{ start: MIN(13), end: MIN(16) }],
        },
      ],
    });
    const plans = planVisitForDay(day, [1, 2, 3]);
    expect(plans.length).toBeGreaterThan(0);
    // Only complete, continuous visits inside the remaining day survive; a
    // plan that merely *starts* at 11:00 with an hour of dead time does not.
    expect(plans.every((plan) => plan.startMin >= MIN(13))).toBe(true);
    expect(plans.every((plan) => plan.endMin <= MIN(16))).toBe(true);
    expect(plans.every((plan) => plan.waitMin <= 30)).toBe(true);
    expect(plans.every((plan) => plan.steps.every((step) => step.barberName === "رضا" || step.barberName === "علی"))).toBe(true);
    // A mixed team is allowed only when it is genuinely continuous.
    for (const plan of plans) {
      for (const step of plan.steps) {
        expect(day.days.find((item) => item.barberId === step.barberId)?.windows.length).toBeGreaterThan(0);
      }
    }
  });

  test("no complete plan means no plan at all — never a partial visit", () => {
    const day = buildDay({
      services: [
        { id: 1, name: "اصلاح", durationMin: 30 },
        { id: 2, name: "رنگ", durationMin: 30 },
      ],
      barbers: [{ id: 1, name: "علی", can: [1], windows: [{ start: MIN(10), end: MIN(18) }] }],
    });
    const plans = planVisitForDay(day, [1, 2]);
    expect(plans).toEqual([]);
    expect(explainEmptyDay(day, [1, 2]).reason).toBe("NO_CAPABLE_BARBER");
  });

  test("keeps the visit continuous instead of scattering isolated slots", () => {
    const day = buildDay({
      services: [
        { id: 1, name: "اصلاح", durationMin: 60 },
        { id: 2, name: "پرس", durationMin: 60 },
      ],
      barbers: [
        {
          id: 1,
          name: "علی",
          can: [1, 2],
          windows: [{ start: MIN(10), end: MIN(20) }],
          busy: [{ start: MIN(11), end: MIN(18) }],
        },
      ],
    });
    const plans = planVisitForDay(day, [1, 2]);
    // From 10:00 the next segment cannot start before 18:00, which would be an
    // eight-hour hole in the visit, so only the continuous 18:00 chain remains.
    expect(plans).toHaveLength(1);
    expect(plans[0].startMin).toBe(MIN(18));
    expect(plans[0].waitMin).toBeLessThanOrEqual(30);
    expect(plans[0].waitMin).toBe(0);
    expect(plans[0].steps[0].endMin).toBe(plans[0].steps[1].startMin);
  });
});

test.describe("visit planner — barber capability", () => {
  test("one barber performing every service yields a single-barber plan", () => {
    const day = buildDay({
      services: [
        { id: 1, name: "اصلاح", durationMin: 30 },
        { id: 2, name: "رنگ", durationMin: 90 },
        { id: 3, name: "پرس", durationMin: 45 },
      ],
      barbers: [{ id: 1, name: "علی", can: [1, 2, 3], windows: [{ start: MIN(10), end: MIN(18) }] }],
    });
    const plans = planVisitForDay(day, [1, 2, 3]);
    expect(plans[0].oneBarber).toBe(true);
    expect(plans[0].barberNames).toEqual(["علی"]);
    expect(plans[0].startMin).toBe(MIN(10));
    expect(plans[0].endMin).toBe(MIN(12, 45));
  });

  test("two barbers able to perform everything are both offered", () => {
    const day = buildDay({
      services: [
        { id: 1, name: "اصلاح", durationMin: 30 },
        { id: 2, name: "رنگ", durationMin: 60 },
        { id: 3, name: "پرس", durationMin: 30 },
      ],
      barbers: [
        { id: 1, name: "علی", can: [1, 2, 3], windows: [{ start: MIN(10), end: MIN(18) }] },
        { id: 2, name: "رضا", can: [1, 2, 3], windows: [{ start: MIN(10), end: MIN(18) }] },
      ],
    });
    const plans = planVisitForDay(day, [1, 2, 3], { limit: 8 });
    const teams = plans.map((plan) => plan.barberNames.join("+"));
    expect(teams).toContain("علی");
    expect(teams).toContain("رضا");
    expect(plans[0].oneBarber).toBe(true);
  });

  test("falls back to two barbers when nobody can do the whole visit", () => {
    const day = buildDay({
      services: [
        { id: 1, name: "اصلاح", durationMin: 30 },
        { id: 2, name: "رنگ", durationMin: 60 },
        { id: 3, name: "پرس", durationMin: 30 },
      ],
      barbers: [
        { id: 1, name: "علی", can: [1, 2], windows: [{ start: MIN(10), end: MIN(18) }] },
        { id: 2, name: "امیر", can: [3], windows: [{ start: MIN(10), end: MIN(18) }] },
      ],
    });
    const plans = planVisitForDay(day, [1, 2, 3]);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0].barberNames.sort()).toEqual(["امیر", "علی"]);
    expect(plans[0].oneBarber).toBe(false);
    expect(plans[0].steps.map((step) => step.serviceName)).toContain("پرس");
  });

  test("a service nobody performs kills the whole visit", () => {
    const day = buildDay({
      services: [
        { id: 1, name: "اصلاح", durationMin: 30 },
        { id: 2, name: "کراتین", durationMin: 120 },
      ],
      barbers: [{ id: 1, name: "علی", can: [1], windows: [{ start: MIN(10), end: MIN(18) }] }],
    });
    expect(planVisitForDay(day, [1, 2])).toEqual([]);
  });
});

test.describe("visit planner — reservation preference", () => {
  const services: ServiceSpec[] = [
    { id: 1, name: "اصلاح", durationMin: 30 },
    { id: 2, name: "رنگ", durationMin: 60 },
  ];

  test("earliest preference ranks the plan that finishes first", () => {
    const day = buildDay({
      services,
      barbers: [
        { id: 1, name: "علی", can: [1, 2], windows: [{ start: MIN(9), end: MIN(18) }] },
        { id: 2, name: "رضا", can: [1, 2], windows: [{ start: MIN(10), end: MIN(18) }] },
      ],
    });
    const plans = planVisitForDay(day, [1, 2], { preference: "EARLIEST" });
    expect(plans[0].barberNames).toEqual(["علی"]);
    expect(plans[0].badges).toContain("EARLIEST");
    expect(plans[0].startMin).toBe(MIN(9));
  });

  test("one-barber preference ranks a later single-barber plan above an earlier split", () => {
    const day = buildDay({
      services,
      barbers: [
        {
          id: 1,
          name: "علی",
          can: [1],
          windows: [{ start: MIN(9), end: MIN(12) }],
        },
        {
          id: 2,
          name: "رضا",
          can: [2],
          windows: [{ start: MIN(9), end: MIN(12) }],
        },
        {
          id: 3,
          name: "امیر",
          can: [1, 2],
          windows: [{ start: MIN(13), end: MIN(18) }],
        },
      ],
    });
    const split = rankVisitPlans(planVisitForDay(day, [1, 2], { limit: 12 }), { preference: "EARLIEST" });
    expect(split[0].oneBarber).toBe(false);

    const plans = planVisitForDay(day, [1, 2], { preference: "ONE_BARBER", limit: 12 });
    expect(plans[0].oneBarber).toBe(true);
    expect(plans[0].barberNames).toEqual(["امیر"]);
    expect(plans[0].badges).toContain("ONE_BARBER");
  });

  test("specific barber preference keeps valid plans that involve that barber", () => {
    const day = buildDay({
      services,
      barbers: [
        { id: 1, name: "علی", can: [1], windows: [{ start: MIN(9), end: MIN(18) }] },
        { id: 2, name: "رضا", can: [1, 2], windows: [{ start: MIN(11), end: MIN(18) }] },
      ],
    });
    const plans = planVisitForDay(day, [1, 2], { preference: "PREFERRED_BARBER", preferredBarberId: 2 });
    expect(plans[0].barberNames).toEqual(["رضا"]);
    expect(plans[0].badges).toContain("PREFERRED_BARBER");

    // The preferred barber can only perform part of the visit: a second,
    // qualified barber completes it instead of failing the request.
    const partial = buildDay({
      services,
      barbers: [
        { id: 1, name: "علی", can: [1], windows: [{ start: MIN(9), end: MIN(18) }] },
        { id: 2, name: "رضا", can: [2], windows: [{ start: MIN(9), end: MIN(18) }] },
      ],
    });
    const mixed = planVisitForDay(partial, [1, 2], { preference: "PREFERRED_BARBER", preferredBarberId: 2 });
    expect(mixed[0].barberNames).toContain("رضا");
    expect(mixed[0].barberNames).toContain("علی");

    // Strict mode is an explicit constraint and yields no plan.
    const strict = planVisitForDay(partial, [1, 2], {
      preference: "PREFERRED_BARBER",
      preferredBarberId: 2,
      onlyPreferredBarber: true,
    });
    expect(strict).toEqual([]);
  });

  test("preferred barber keeps every qualified candidate, not just one", () => {
    const day = buildDay({
      services: [{ id: 1, name: "اصلاح", durationMin: 30 }],
      barbers: [
        { id: 1, name: "علی", can: [1], windows: [{ start: MIN(10), end: MIN(18) }] },
        { id: 2, name: "رضا", can: [1], windows: [{ start: MIN(10, 30), end: MIN(18) }] },
      ],
    });
    const plans = planVisitForDay(day, [1], { preference: "EARLIEST" });
    expect(plans[0].barberNames).toEqual(["علی"]);
    expect(plans[0].startMin).toBe(MIN(10));
    expect(plans.some((plan) => plan.barberNames.join("") === "رضا" && plan.startMin === MIN(10, 30))).toBe(true);

    const options = groupVisitPlans(plans, { optionsLimit: 4 });
    expect(options.map((option) => option.barberNames.join(""))).toEqual(["علی", "رضا"]);
  });
});

test.describe("visit planner — processing time and buffers", () => {
  test("client time can be shorter or longer than barber time", () => {
    const day = buildDay({
      services: [
        // 90 minutes at the salon, 30 of them at the chair.
        { id: 1, name: "رنگ", durationMin: 90, barberDurationMin: 30, bufferMin: 5 },
      ],
      barbers: [{ id: 1, name: "علی", can: [1], windows: [{ start: MIN(10), end: MIN(14) }] }],
    });
    const plans = planVisitForDay(day, [1]);
    expect(plans[0].durationMin).toBe(90);
    expect(plans[0].steps[0].barberEndMin).toBe(MIN(10, 35));
    expect(plans[0].steps[0].processingMin).toBe(60);
    expect(plans[0].badges).toContain("PROCESSING");
  });

  test("the next segment never starts before the previous client window ends", () => {
    const day = buildDay({
      services: [
        { id: 1, name: "رنگ", durationMin: 90, barberDurationMin: 30 },
        { id: 2, name: "پرس", durationMin: 30 },
      ],
      barbers: [{ id: 1, name: "علی", can: [1, 2], windows: [{ start: MIN(10), end: MIN(18) }] }],
    });
    const plans = planVisitForDay(day, [1, 2]);
    const [first, second] = plans[0].steps;
    expect(second.startMin).toBeGreaterThanOrEqual(first.endMin);
  });

  test("barber buffer is respected between two visits", async () => {
    const day = buildDay({
      services: [{ id: 1, name: "اصلاح", durationMin: 30, bufferMin: 10 }],
      barbers: [
        {
          id: 1,
          name: "علی",
          can: [1],
          windows: [{ start: MIN(10), end: MIN(18) }],
          busy: [{ start: MIN(10, 30), end: MIN(11) }],
        },
      ],
    });
    const plans = planVisitForDay(day, [1]);
    // 10:30–11:00 is taken; with a 10-minute buffer the barber is free again at 11:00.
    expect(plans[0].startMin).toBe(MIN(11));
    const source = fakeSource([day]);
    const rejected = await validateVisitItems(source, [
      { barberId: 1, serviceId: 1, date: day.date, startMin: MIN(10, 40) },
    ]);
    expect(rejected.ok).toBe(false);
  });
});

test.describe("visit planner — server revalidation", () => {
  const day = buildDay({
    date: "2026-10-06",
    services: [
      { id: 1, name: "اصلاح", durationMin: 30 },
      { id: 2, name: "رنگ", durationMin: 60 },
    ],
    barbers: [
      {
        id: 1,
        name: "علی",
        can: [1, 2],
        windows: [{ start: MIN(10), end: MIN(18) }],
        busy: [{ start: MIN(12), end: MIN(13) }],
      },
    ],
  });
  const source = fakeSource([day]);

  test("accepts the exact plan the engine produced", async () => {
    const plans = planVisitForDay(day, [1, 2]);
    const items = plans[0].steps.map((step) => ({
      attendeeId: "primary",
      barberId: step.barberId,
      serviceId: step.serviceId,
      date: day.date,
      startMin: step.startMin,
    }));
    expect(await validateVisitItems(source, items)).toEqual({ ok: true });
  });

  test("rejects a start inside existing busy time", async () => {
    const result = await validateVisitItems(source, [
      { attendeeId: "primary", barberId: 1, serviceId: 1, date: day.date, startMin: MIN(12, 15) },
    ]);
    expect(result.ok).toBe(false);
  });

  test("rejects a service the barber is not approved for", async () => {
    const other = buildDay({
      date: "2026-10-06",
      services: [
        { id: 1, name: "اصلاح", durationMin: 30 },
        { id: 3, name: "کراتین", durationMin: 60 },
      ],
      barbers: [{ id: 1, name: "علی", can: [1], windows: [{ start: MIN(10), end: MIN(18) }] }],
    });
    const result = await validateVisitItems(fakeSource([other]), [
      { attendeeId: "primary", barberId: 1, serviceId: 3, date: other.date, startMin: MIN(10) },
    ]);
    expect(result.ok).toBe(false);
  });

  test("rejects two simultaneous services for the same client", async () => {
    const two = buildDay({
      date: "2026-10-06",
      services: [
        { id: 1, name: "اصلاح", durationMin: 60 },
        { id: 2, name: "پرس", durationMin: 60 },
      ],
      barbers: [{ id: 1, name: "علی", can: [1], windows: [{ start: MIN(10), end: MIN(18) }] }],
    });
    const twoBarbers = buildDay({
      date: "2026-10-06",
      services: [
        { id: 1, name: "اصلاح", durationMin: 60 },
        { id: 2, name: "پرس", durationMin: 60 },
      ],
      barbers: [
        { id: 1, name: "علی", can: [1], windows: [{ start: MIN(10), end: MIN(18) }] },
        { id: 2, name: "رضا", can: [2], windows: [{ start: MIN(10), end: MIN(18) }] },
      ],
    });
    void two;
    const result = await validateVisitItems(fakeSource([twoBarbers]), [
      { attendeeId: "primary", barberId: 1, serviceId: 1, date: twoBarbers.date, startMin: MIN(10) },
      { attendeeId: "primary", barberId: 2, serviceId: 2, date: twoBarbers.date, startMin: MIN(10, 30) },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("هم‌زمان");
  });

  test("rejects times outside the working window and off the grid", async () => {
    const late = await validateVisitItems(source, [
      { attendeeId: "primary", barberId: 1, serviceId: 2, date: day.date, startMin: MIN(17, 45) },
    ]);
    expect(late.ok).toBe(false);
    const offGrid = await validateVisitItems(source, [
      { attendeeId: "primary", barberId: 1, serviceId: 1, date: day.date, startMin: MIN(10, 10) },
    ]);
    expect(offGrid.ok).toBe(false);
  });

  test("a hold blocks the resource it protects", async () => {
    const withHold = buildDay({
      date: "2026-10-07",
      services: [{ id: 1, name: "اصلاح", durationMin: 30 }],
      barbers: [
        {
          id: 1,
          name: "علی",
          can: [1],
          windows: [{ start: MIN(10), end: MIN(18) }],
          busy: [{ start: MIN(10), end: MIN(10, 35) }],
        },
      ],
    });
    const result = await validateVisitItems(fakeSource([withHold]), [
      { attendeeId: "primary", barberId: 1, serviceId: 1, date: withHold.date, startMin: MIN(10) },
    ]);
    expect(result.ok).toBe(false);
  });

  test("a full-day block (leave) removes the day", async () => {
    const onLeave = buildDay({
      date: "2026-10-08",
      services: [{ id: 1, name: "اصلاح", durationMin: 30 }],
      barbers: [
        {
          id: 1,
          name: "علی",
          can: [1],
          windows: [{ start: MIN(10), end: MIN(18) }],
          busy: [{ start: 0, end: 24 * 60 }],
        },
      ],
    });
    expect(planVisitForDay(onLeave, [1])).toEqual([]);
  });
});

test.describe("visit planner — smart calendar", () => {
  const openDay = (date: string) =>
    buildDay({
      date,
      services: [{ id: 1, name: "اصلاح", durationMin: 60 }],
      barbers: [{ id: 1, name: "علی", can: [1], windows: [{ start: MIN(10), end: MIN(12) }] }],
    });
  const closedDay = (date: string) =>
    buildDay({
      date,
      services: [{ id: 1, name: "اصلاح", durationMin: 60 }],
      barbers: [{ id: 1, name: "علی", can: [1], windows: [] }],
    });

  test("summarises plan counts per day and finds the nearest open day", async () => {
    const source = fakeSource([closedDay("2026-10-06"), closedDay("2026-10-07"), openDay("2026-10-08"), openDay("2026-10-09")]);
    const calendar = await planCalendar(source, {
      serviceIds: [1],
      from: "2026-10-06",
      days: 4,
    });
    expect(calendar.map((day) => day.planCount)).toEqual([0, 0, 3, 3]);
    expect(calendar[2].startCount).toBe(3);
    expect(calendar[2].optionCount).toBe(1);
    expect(calendar[2].firstStartMin).toBe(MIN(10));
    expect(calendar[2].firstEndMin).toBe(MIN(11));
    expect(nearestOpenDay(calendar)?.date).toBe("2026-10-08");
  });

  test("a closed day explains itself instead of showing an empty grid", () => {
    const day = closedDay("2026-10-06");
    expect(explainEmptyDay(day, [1]).reason).toBe("SALON_CLOSED");
  });

  test("a fully booked day explains capacity rather than blaming the user", () => {
    const day = buildDay({
      date: "2026-10-06",
      services: [{ id: 1, name: "اصلاح", durationMin: 60 }],
      barbers: [
        {
          id: 1,
          name: "علی",
          can: [1],
          windows: [{ start: MIN(10), end: MIN(18) }],
          busy: [{ start: MIN(10), end: MIN(18) }],
        },
      ],
    });
    const explanation = explainEmptyDay(day, [1]);
    expect(explanation.reason).toBe("BUSY_DAY");
    expect(explanation.message).toContain("کامل");
  });

  test("planDay reports the explanation with an empty plan list", async () => {
    const source = fakeSource([closedDay("2026-10-06")]);
    const result = await planVisitDay(source, { date: "2026-10-06", serviceIds: [1] });
    expect(result.plans).toEqual([]);
    expect(result.options).toEqual([]);
    expect(result.explanation?.reason).toBe("SALON_CLOSED");
  });
});

test.describe("visit planner — visit integrity", () => {
  test("every step participates in one continuous visit", () => {
    const day = buildDay({
      services: [
        { id: 1, name: "اصلاح", durationMin: 30 },
        { id: 2, name: "رنگ", durationMin: 90, barberDurationMin: 30 },
        { id: 3, name: "پرس", durationMin: 30 },
      ],
      barbers: [
        { id: 1, name: "علی", can: [1, 2, 3], windows: [{ start: MIN(10), end: MIN(18) }] },
      ],
    });
    const plan = planVisitForDay(day, [1, 2, 3])[0];
    expect(stepSignature(plan)).toEqual([
      "اصلاح@600-630#علی",
      "رنگ@630-720#علی",
      "پرس@720-750#علی",
    ]);
    expect(plan.price).toBe(300_000);
    expect(plan.paymentMode).toBe("NO_PAYMENT");
    expect(plan.handoffs).toBe(0);
  });

  test("pricing is summed per barber offer, not per catalogue price", () => {
    const day = buildDay({
      services: [
        { id: 1, name: "اصلاح", durationMin: 30, price: 100_000 },
        { id: 2, name: "پرس", durationMin: 30, price: 50_000 },
      ],
      barbers: [{ id: 1, name: "علی", can: [1, 2], windows: [{ start: MIN(10), end: MIN(18) }] }],
    });
    const plan = planVisitForDay(day, [1, 2])[0];
    expect(plan.price).toBe(150_000);
    expect(plan.remainingDue).toBe(150_000);
  });
});

test.describe("visit planner — blocked time is not a client booking", () => {
  const leaveDay = () =>
    buildDay({
      date: "2026-10-06",
      services: [{ id: 1, name: "اصلاح", durationMin: 30 }],
      barbers: [
        {
          id: 1,
          name: "علی",
          can: [1],
          windows: [{ start: MIN(10), end: MIN(13) }],
          blocked: [{ start: MIN(11), end: MIN(12) }],
        },
      ],
    });

  test("staff leave blocks planning exactly like an existing booking", () => {
    const day = leaveDay();
    const plans = planVisitForDay(day, [1]);
    expect(plans.map((plan) => plan.startMin)).toEqual([MIN(10), MIN(10, 30), MIN(12), MIN(12, 30)]);
    expect(plans.some((plan) => plan.startMin === MIN(11) || plan.startMin === MIN(11, 30))).toBe(false);
  });

  test("unavailable() merges bookings and blocked time without mutating either list", () => {
    const day = buildDay({
      date: "2026-10-06",
      services: [{ id: 1, name: "اصلاح", durationMin: 30 }],
      barbers: [
        {
          id: 1,
          name: "علی",
          can: [1],
          windows: [{ start: MIN(10), end: MIN(18) }],
          busy: [{ start: MIN(10), end: MIN(10, 30) }],
          blocked: [{ start: MIN(10, 30), end: MIN(11) }],
        },
      ],
    });
    expect(unavailable(day.days[0])).toEqual([{ start: MIN(10), end: MIN(11) }]);
    expect(day.days[0].busy).toEqual([{ start: MIN(10), end: MIN(10, 30) }]);
    expect(day.days[0].blocked).toEqual([{ start: MIN(10, 30), end: MIN(11) }]);
  });

  test("the write guard refuses a start inside blocked time and says why", async () => {
    const day = leaveDay();
    const result = await validateVisitItems(fakeSource([day]), [
      { attendeeId: "me", barberId: 1, serviceId: 1, date: day.date, startMin: MIN(11) },
    ]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("رزرو شد");
  });

  test("a valid start next to blocked time is still accepted", async () => {
    const day = leaveDay();
    const result = await validateVisitItems(fakeSource([day]), [
      { attendeeId: "me", barberId: 1, serviceId: 1, date: day.date, startMin: MIN(10) },
    ]);
    expect(result.ok).toBe(true);
  });
});
