/**
 * Slot grid — presentation over the one scheduling engine.
 *
 * This module owns no availability rules. Working windows, blocked time, holds,
 * existing bookings and the "does it fit" decision all come from
 * `visit-planner.ts` / `visit-planner-db.ts`; what is left here is the grid a
 * screen renders (AVAILABLE / BOOKED / CLOSED) plus a few forward-scan helpers
 * for marketing surfaces (service and barber profiles, barber card, heatmap).
 *
 * Anything that books must go through the planner; the grid may never say a time
 * is free when the planner would refuse it.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { barberServices, barbers } from "@/db/schema";
import { resolveService } from "./service-catalog";
import { SLOT_STEP, addDaysISO, persianWeekday, salonMinuteOfDay, todayISO } from "./time";
import { planVisitDay, type Interval, type PlannerDayData } from "./visit-planner";
import { createDbPlannerSource } from "./visit-planner-db";

export type SlotState = "AVAILABLE" | "BOOKED" | "CLOSED";

export type Slot = {
  startMin: number;
  endMin: number;
  state: SlotState;
  label: string;
  appointmentId?: number;
};

export { SLOT_STEP };

export type { ResolvedService } from "./service-catalog";
export { resolveService, splitPayment } from "./service-catalog";

type DayContext = {
  open: boolean;
  startMin: number;
  endMin: number;
  busy: Interval[];
  blocked: Interval[];
};

/** The planner's day snapshot, through the shared Drizzle adapter. */
async function loadPlannerDay(date: string, excludePhone?: string): Promise<PlannerDayData> {
  return createDbPlannerSource({ serviceIds: [], excludePhone }).loadDay(date);
}

/**
 * Legacy day context for one barber.
 *
 * Kept for the staff walk-in grid; the numbers are read out of the planner's day
 * snapshot so blocked time and client bookings keep their distinct labels.
 */
export async function getDayContext(
  barberId: number,
  date: string,
  excludePhone?: string,
): Promise<DayContext> {
  const data = await loadPlannerDay(date, excludePhone);
  const day = data.days.find((row) => row.barberId === barberId);
  const window = day?.windows[0];
  return {
    open: Boolean(window),
    startMin: window?.start ?? 0,
    endMin: window?.end ?? 0,
    busy: day?.busy ?? [],
    blocked: day?.blocked ?? [],
  };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Grid of candidate starts for one barber and one duration.
 *
 * A start stays AVAILABLE only when the service (plus its buffer) fits inside the
 * working window without touching a booking or blocked time — the same rule the
 * planner applies, so a customer is never offered a start that cannot complete.
 */
export function buildSlots(
  ctx: DayContext,
  durationMin: number,
  bufferMin: number,
  date: string,
): Slot[] {
  const dayStart = 9 * 60;
  const dayEnd = 23 * 60;
  const slots: Slot[] = [];
  const nowIso = todayISO();
  const nowMin = salonMinuteOfDay();

  for (let start = dayStart; start + durationMin <= dayEnd; start += SLOT_STEP) {
    const end = start + durationMin;
    const withBuffer = end + bufferMin;
    let state: SlotState = "AVAILABLE";
    if (!ctx.open || start < ctx.startMin || end > ctx.endMin) {
      state = "CLOSED";
    } else if (ctx.blocked.some((b) => overlaps(start, end, b.start, b.end))) {
      state = "CLOSED";
    } else if (date < nowIso || (date === nowIso && start <= nowMin)) {
      state = "CLOSED";
    }
    const hit = ctx.busy.find((b) => overlaps(start, withBuffer, b.start, b.end));
    if (state === "AVAILABLE" && hit) state = "BOOKED";

    slots.push({
      startMin: start,
      endMin: end,
      state,
      label: state === "AVAILABLE" ? "آزاد" : state === "BOOKED" ? "رزرو شده" : "غیرفعال",
    });
  }
  return slots;
}

export async function getAvailability(barberId: number, serviceId: number, date: string) {
  const service = await resolveService(barberId, serviceId);
  if (!service) return { service: null, slots: [] as Slot[] };
  const ctx = await getDayContext(barberId, date);
  return {
    service,
    slots: buildSlots(ctx, service.barberDurationMin, service.bufferMin, date),
  };
}

/** First complete visit for one barber and one service, scanning forward. */
export async function nextAvailable(
  barberId: number,
  serviceId: number,
  fromDate = todayISO(),
  horizonDays = 21,
): Promise<{ date: string; startMin: number } | null> {
  const source = createDbPlannerSource({ serviceIds: [serviceId] });
  for (let i = 0; i < horizonDays; i += 1) {
    const date = addDaysISO(fromDate, i);
    const result = await planVisitDay(source, {
      date,
      serviceIds: [serviceId],
      preference: "PREFERRED_BARBER",
      preferredBarberId: barberId,
      onlyPreferredBarber: true,
      limit: 1,
    });
    const plan = result.plans[0];
    const step = plan?.steps[0];
    if (plan && step) return { date, startMin: step.startMin };
  }
  return null;
}

/**
 * Earliest barber for one service — used where a customer has no barber preference
 * yet. Runs one calendar sweep instead of a per-barber loop, so every candidate is
 * compared under identical rules.
 */
export async function anyBarberSuggestion(serviceId: number, fromDate = todayISO()) {
  const source = createDbPlannerSource({ serviceIds: [serviceId] });
  for (let i = 0; i < 14; i += 1) {
    const date = addDaysISO(fromDate, i);
    const result = await planVisitDay(source, { date, serviceIds: [serviceId], preference: "EARLIEST", limit: 1 });
    const step = result.plans[0]?.steps[0];
    if (!step) continue;
    const [barber] = await db.select().from(barbers).where(eq(barbers.id, step.barberId)).limit(1);
    return { barberId: step.barberId, name: barber?.name ?? "", date, startMin: step.startMin };
  }
  return null;
}

/** First N bookable starts for a barber, scanning forward day by day. */
export async function upcomingSlots(
  barberId: number,
  serviceId: number,
  count = 3,
  horizonDays = 7,
): Promise<{ date: string; startMin: number }[]> {
  const source = createDbPlannerSource({ serviceIds: [serviceId] });
  const out: { date: string; startMin: number }[] = [];
  for (let i = 0; i < horizonDays && out.length < count; i += 1) {
    const date = addDaysISO(todayISO(), i);
    const result = await planVisitDay(source, {
      date,
      serviceIds: [serviceId],
      preference: "PREFERRED_BARBER",
      preferredBarberId: barberId,
      onlyPreferredBarber: true,
      limit: 4,
    });
    const starts = new Set<number>();
    for (const plan of result.plans) {
      const step = plan.steps[0];
      if (!step || starts.has(step.startMin)) continue;
      starts.add(step.startMin);
      out.push({ date, startMin: step.startMin });
      if (out.length >= count) break;
    }
  }
  return out;
}

/** Heatmap for the next N days (public safe: state and reason only). */
export async function heatmap(barberId: number, serviceId: number, days = 7) {
  const service = await resolveService(barberId, serviceId);
  if (!service) return [];
  const result: { date: string; slots: Slot[] }[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDaysISO(todayISO(), i);
    const ctx = await getDayContext(barberId, date);
    result.push({ date, slots: buildSlots(ctx, service.barberDurationMin, service.bufferMin, date) });
  }
  return result;
}

/** Barbers who can actually perform a service, for filters and fallbacks. */
export async function capableBarbers(serviceId: number) {
  const links = await db
    .select({ barberId: barberServices.barberId })
    .from(barberServices)
    .where(eq(barberServices.serviceId, serviceId));
  if (links.length === 0) return [];
  const rows = await db
    .select()
    .from(barbers)
    .where(
      and(
        inArray(
          barbers.id,
          links.map((link) => link.barberId),
        ),
        eq(barbers.active, true),
      ),
    );
  const resolved = await Promise.all(rows.map(async (barber) => ((await resolveService(barber.id, serviceId)) ? barber : null)));
  return resolved.filter((barber): barber is (typeof rows)[number] => Boolean(barber));
}

/** Weekday-independent helper kept for callers that only need the salon clock. */
export { persianWeekday, salonMinuteOfDay };
