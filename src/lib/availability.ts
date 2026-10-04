import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  barberSchedule,
  barberServices,
  barberSkills,
  barbers,
  blockedTimes,
  bookingHolds,
  classSessions,
  classes,
  salonSchedule,
  services,
} from "@/db/schema";
import { addDaysISO, persianWeekday, salonMinuteOfDay, todayISO } from "./time";

export type SlotState = "AVAILABLE" | "BOOKED" | "CLOSED";

export type Slot = {
  startMin: number;
  endMin: number;
  state: SlotState;
  label: string;
  appointmentId?: number;
};

export const SLOT_STEP = 30;
const CANCELLED = ["CANCELLED_BY_CLIENT", "CANCELLED_BY_STAFF"];

export type ResolvedService = {
  id: number;
  name: string;
  /** Total time the client is receiving or waiting for the service. */
  durationMin: number;
  /** Time during which the assigned barber is occupied. */
  barberDurationMin: number;
  bufferMin: number;
  /** Minutes the client waits (processing) while the barber may be released. */
  processingMin: number;
  allowParallel: boolean;
  managerApprovalRequired: boolean;
  price: number;
  paymentMode: "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT";
  depositAmount: number;
  /** Amount that must be paid online before the appointment is secured. */
  amountDueOnline: number;
  /** Amount still payable at the salon. */
  remainingDue: number;
};

/**
 * Skills gate scheduling: a PENDING/REJECTED claim never makes a barber
 * eligible. Every eligibility query in the app filters `barber_skills` with
 * status = 'APPROVED'.
 */
export const SKILL_APPROVED = "APPROVED" as const;

/** Splits a service price into the online deposit and the salon balance. */
export function splitPayment(
  price: number,
  paymentMode: ResolvedService["paymentMode"],
  depositAmount: number,
): { amountDueOnline: number; remainingDue: number } {
  if (paymentMode === "FULL_PAYMENT") {
    return { amountDueOnline: price, remainingDue: 0 };
  }
  if (paymentMode === "DEPOSIT") {
    const deposit = Math.min(Math.max(depositAmount, 0), price);
    return { amountDueOnline: deposit, remainingDue: price - deposit };
  }
  return { amountDueOnline: 0, remainingDue: price };
}

export async function resolveService(
  barberId: number,
  serviceId: number,
): Promise<ResolvedService | null> {
  const [svc] = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);
  if (!svc || !svc.active) return null;
  const [barber] = await db.select({ id: barbers.id }).from(barbers)
    .where(and(eq(barbers.id, barberId), eq(barbers.active, true))).limit(1);
  if (!barber) return null;
  if (svc.requiredSkillId) {
    // Only an APPROVED skill makes this barber eligible (skill approval gates scheduling).
    const [approvedSkill] = await db.select({ id: barberSkills.id }).from(barberSkills)
      .where(and(
        eq(barberSkills.barberId, barberId),
        eq(barberSkills.skillId, svc.requiredSkillId),
        eq(barberSkills.status, SKILL_APPROVED),
      )).limit(1);
    if (!approvedSkill) return null;
  }
  const [link] = await db
    .select()
    .from(barberServices)
    .where(
      and(
        eq(barberServices.barberId, barberId),
        eq(barberServices.serviceId, serviceId),
      ),
    )
    .limit(1);
  if (!link) return null;
  const price = link.customPrice ?? svc.basePrice;
  const { amountDueOnline, remainingDue } = splitPayment(
    price,
    svc.paymentMode as ResolvedService["paymentMode"],
    svc.depositAmount,
  );
  const barberDurationMin = link.customBarberDuration ?? svc.barberDurationMin;
  const durationMin = Math.max(link.customDuration ?? svc.durationMin, barberDurationMin);
  return {
    id: svc.id,
    name: svc.name,
    durationMin,
    barberDurationMin,
    bufferMin: svc.bufferMin,
    /** Client stays past the barber's work (processing); derived, never invented. */
    processingMin: Math.max(0, durationMin - barberDurationMin),
    allowParallel: svc.allowParallel,
    managerApprovalRequired: svc.managerApprovalRequired,
    price,
    paymentMode: svc.paymentMode as ResolvedService["paymentMode"],
    depositAmount: svc.depositAmount,
    amountDueOnline,
    remainingDue,
  };
}

export type DayContext = {
  open: boolean;
  startMin: number;
  endMin: number;
  busy: { start: number; end: number; id: number; kind?: "booking" | "hold" }[];
  blocked: { start: number; end: number; kind?: "blocked" | "class"; title?: string }[];
};

export async function getDayContext(
  barberId: number,
  date: string,
  excludePhone?: string,
): Promise<DayContext> {
  const weekday = persianWeekday(date);
  const [salon] = await db
    .select()
    .from(salonSchedule)
    .where(eq(salonSchedule.weekday, weekday))
    .limit(1);
  const [barberDay] = await db
    .select()
    .from(barberSchedule)
    .where(
      and(
        eq(barberSchedule.barberId, barberId),
        eq(barberSchedule.weekday, weekday),
      ),
    )
    .limit(1);

  const open = Boolean(
    salon && !salon.closed && barberDay && !barberDay.dayOff,
  );
  const startMin = Math.max(salon?.openMin ?? 0, barberDay?.startMin ?? 0);
  const endMin = Math.min(salon?.closeMin ?? 0, barberDay?.endMin ?? 0);

  const appts = await db
    .select()
    .from(appointments)
    .where(
      and(eq(appointments.barberId, barberId), eq(appointments.date, date)),
    );
  const blocks = await db
    .select()
    .from(blockedTimes)
    .where(and(eq(blockedTimes.barberId, barberId), eq(blockedTimes.date, date)));
  // Academy awareness: today's class sessions block the instructor's salon availability.
  const teachSessions = await db
    .select({
      startMin: classSessions.startMin,
      endMin: sql<number>`${classSessions.endMin} + ${classSessions.bufferMin}`,
      title: classes.title,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classes.id, classSessions.classId))
    .where(and(eq(classSessions.date, date), eq(classes.instructorBarberId, barberId)));
  const holds = await db.select({
    id: bookingHolds.id,
    startMin: bookingHolds.startMin,
    clientPhone: bookingHolds.clientPhone,
    durationMin: bookingHolds.durationMin,
    duration: services.barberDurationMin,
    customDuration: barberServices.customBarberDuration,
    bufferMin: services.bufferMin,
  }).from(bookingHolds)
    .innerJoin(services, eq(bookingHolds.serviceId, services.id))
    .leftJoin(barberServices, and(eq(barberServices.barberId, bookingHolds.barberId), eq(barberServices.serviceId, bookingHolds.serviceId)))
    .where(and(eq(bookingHolds.barberId, barberId), eq(bookingHolds.date, date), gt(bookingHolds.expiresAt, new Date())));
  const expiryCutoff = Date.now() - 10 * 60_000;
  return {
    open: open && endMin > startMin,
    startMin,
    endMin,
    busy: [
      ...appts.filter((a) => !CANCELLED.includes(a.status) &&
        !(a.status === "PENDING" && a.createdAt.getTime() < expiryCutoff))
        .map((a) => ({ start: a.startMin, end: a.barberEndMin, id: a.id, kind: "booking" as const })),
      ...holds.filter((h) => !excludePhone || h.clientPhone !== excludePhone)
        .map((h) => ({
          start: h.startMin,
          // Plan holds store their exact occupied span; legacy rows fall back
          // to resolving the service duration for this barber.
          end: h.startMin + (h.durationMin > 0 ? h.durationMin : (h.customDuration ?? h.duration) + h.bufferMin),
          id: -h.id,
          kind: "hold" as const,
        })),
    ],
    blocked: [
      ...blocks.map((b) => ({
        start: b.fullDay ? 0 : b.startMin,
        end: b.fullDay ? 24 * 60 : b.endMin,
        kind: "blocked" as const,
      })),
      ...teachSessions.map((s) => ({ start: s.startMin, end: s.endMin, kind: "class" as const, title: s.title })),
    ],
  };
}

import { overlaps } from "./windows";
export { overlaps };

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

  for (
    let start = dayStart;
    start + durationMin <= dayEnd;
    start += SLOT_STEP
  ) {
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
    const hit = ctx.busy.find((b) =>
      overlaps(start, withBuffer, b.start, b.end),
    );
    if (state === "AVAILABLE" && hit) state = "BOOKED";

    slots.push({
      startMin: start,
      endMin: end,
      state,
      appointmentId: hit?.id,
      label:
        state === "AVAILABLE"
          ? "آزاد"
          : state === "BOOKED"
            ? "رزرو شده"
            : "غیرفعال",
    });
  }
  return slots;
}

export async function getAvailability(
  barberId: number,
  serviceId: number,
  date: string,
) {
  const service = await resolveService(barberId, serviceId);
  if (!service) return { service: null, slots: [] as Slot[] };
  const ctx = await getDayContext(barberId, date);
  return {
    service,
    slots: buildSlots(ctx, service.barberDurationMin, service.bufferMin, date),
  };
}

export async function nextAvailable(
  barberId: number,
  serviceId: number,
  fromDate = todayISO(),
  horizonDays = 21,
): Promise<{ date: string; startMin: number } | null> {
  for (let i = 0; i < horizonDays; i += 1) {
    const date = addDaysISO(fromDate, i);
    const { slots } = await getAvailability(barberId, serviceId, date);
    const free = slots.find((s) => s.state === "AVAILABLE");
    if (free) return { date, startMin: free.startMin };
  }
  return null;
}

export async function anyBarberSuggestion(
  serviceId: number,
  fromDate = todayISO(),
) {
  const links = await db
    .select({ barberId: barberServices.barberId })
    .from(barberServices)
    .where(eq(barberServices.serviceId, serviceId));
  const ids = links.map((l) => l.barberId);
  if (ids.length === 0) return null;
  const activeBarbers = await db
    .select()
    .from(barbers)
    .where(inArray(barbers.id, ids));
  let best: {
    barberId: number;
    name: string;
    date: string;
    startMin: number;
  } | null = null;
  for (const b of activeBarbers.filter((x) => x.active)) {
    const next = await nextAvailable(b.id, serviceId, fromDate, 14);
    if (!next) continue;
    const better =
      !best ||
      next.date < best.date ||
      (next.date === best.date && next.startMin < best.startMin);
    if (better) best = { barberId: b.id, name: b.name, ...next };
  }
  return best;
}

/**
 * First N bookable slots for a barber, scanning forward day by day.
 * Used by barber cards so a client can book without opening the profile.
 */
export async function upcomingSlots(
  barberId: number,
  serviceId: number,
  count = 3,
  horizonDays = 7,
): Promise<{ date: string; startMin: number }[]> {
  const out: { date: string; startMin: number }[] = [];
  const start = todayISO();
  for (let i = 0; i < horizonDays && out.length < count; i += 1) {
    const date = addDaysISO(start, i);
    const { slots } = await getAvailability(barberId, serviceId, date);
    for (const slot of slots) {
      if (slot.state !== "AVAILABLE") continue;
      out.push({ date, startMin: slot.startMin });
      if (out.length >= count) break;
    }
  }
  return out;
}

/** Heatmap for the next N days (public safe: state only). */
export async function heatmap(barberId: number, serviceId: number, days = 7) {
  const start = todayISO();
  const result: { date: string; slots: Slot[] }[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDaysISO(start, i);
    const { slots } = await getAvailability(barberId, serviceId, date);
    result.push({ date, slots });
  }
  return result;
}
