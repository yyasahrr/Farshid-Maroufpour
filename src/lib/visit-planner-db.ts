/**
 * Drizzle adapter for the visit planner.
 *
 * This is the data layer of the one scheduling engine in `visit-planner.ts`; it
 * contains no scheduling decisions. Capability, working windows, blocked time,
 * existing appointments and active holds are loaded in batched queries, and the
 * day snapshot itself is built with the same rules the single-service slot list
 * already used (cancelled appointments and expired `PENDING` rows stay free,
 * holds older than their expiry do not).
 */

import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  barberSchedule,
  barberServices,
  barberSkills,
  barbers,
  blockedTimes,
  bookingHolds,
  salonSchedule,
  services,
} from "@/db/schema";
import { resolveService } from "./service-catalog";
import {
  mergeIntervals,
  unavailable,
  type BarberDay,
  type Interval,
  type PlannerBarber,
  type PlannerDataSource,
  type PlannerDayData,
  type PlannerService,
  type ServiceOffer,
} from "./visit-planner";
import { persianWeekday, salonMinuteOfDay, todayISO } from "./time";

const CANCELLED = ["CANCELLED_BY_CLIENT", "CANCELLED_BY_STAFF"];
/** Same grace window the slot list uses for abandoned payment-pending rows. */
const PENDING_GRACE_MS = 10 * 60_000;

export type DbPlannerSourceOptions = {
  serviceIds: number[];
  /** Holds belonging to this phone are ignored so a customer keeps their own slot. */
  excludePhone?: string;
  /**
   * Appointments that must not count as busy — used when revalidating a visit
   * that is being moved or reassigned, where the rows being changed would
   * otherwise block their own new time.
   */
  excludeAppointmentIds?: number[];
};

type PreparedContext = {
  services: PlannerService[];
  barbers: PlannerBarber[];
  offers: ServiceOffer[];
  barberIds: number[];
  /** weekday → merged salon window, or null when the salon is closed. */
  salonWindows: Map<number, Interval | null>;
  /** `${barberId}:${weekday}` → that barber's window for the weekday. */
  barberWindows: Map<string, Interval | null>;
};

export function createDbPlannerSource(options: DbPlannerSourceOptions): PlannerDataSource {
  let prepared: Promise<PreparedContext> | null = null;

  async function prepare(): Promise<PreparedContext> {
    const requested = [...new Set(options.serviceIds)].filter((id) => Number.isInteger(id) && id > 0);
    const [serviceRows, barberRows, hours, links] = await Promise.all([
      db.select().from(services).where(and(inArray(services.id, requested), eq(services.active, true))),
      db.select().from(barbers).where(eq(barbers.active, true)),
      db.select().from(salonSchedule),
      db.select().from(barberServices),
    ]);

    const barberIds = barberRows.map((barber) => barber.id);
    const schedules = barberIds.length
      ? await db.select().from(barberSchedule).where(inArray(barberSchedule.barberId, barberIds))
      : [];

    const salonWindows = new Map<number, Interval | null>();
    for (const row of hours) {
      salonWindows.set(
        row.weekday,
        row.closed || row.closeMin <= row.openMin ? null : { start: row.openMin, end: row.closeMin },
      );
    }
    const barberWindows = new Map<string, Interval | null>();
    for (const row of schedules) {
      barberWindows.set(
        `${row.barberId}:${row.weekday}`,
        row.dayOff || row.endMin <= row.startMin ? null : { start: row.startMin, end: row.endMin },
      );
    }

    // Capability + per-barber resolution. `resolveService` is the exact function
    // booking creation uses, so a plan can never include a barber the final
    // transaction would reject.
    const offers: ServiceOffer[] = [];
    for (const service of serviceRows) {
      for (const barber of barberRows) {
        if (!links.some((link) => link.barberId === barber.id && link.serviceId === service.id)) continue;
        const resolved = await resolveService(barber.id, service.id);
        if (!resolved) continue;
        offers.push({
          barberId: barber.id,
          serviceId: service.id,
          durationMin: resolved.durationMin,
          barberDurationMin: resolved.barberDurationMin,
          bufferMin: resolved.bufferMin,
          price: resolved.price,
          paymentMode: resolved.paymentMode,
          amountDueOnline: resolved.amountDueOnline,
          remainingDue: resolved.remainingDue,
        });
      }
    }

    const barbersList: PlannerBarber[] = barberRows.map((barber) => ({
      id: barber.id,
      name: barber.name,
      title: barber.title,
      serviceIds: [...new Set(offers.filter((offer) => offer.barberId === barber.id).map((offer) => offer.serviceId))],
    }));

    return {
      services: serviceRows.map((service) => ({
        id: service.id,
        name: service.name,
        category: service.category,
      })),
      barbers: barbersList,
      offers,
      barberIds,
      salonWindows,
      barberWindows,
    };
  }

  const excludedAppointmentIds = options.excludeAppointmentIds?.length
    ? new Set(options.excludeAppointmentIds)
    : null;

  async function loadDay(date: string): Promise<PlannerDayData> {
    prepared ??= prepare();
    const context = await prepared;
    const weekday = persianWeekday(date);
    const salonWindow = context.salonWindows.get(weekday) ?? null;

    const windowsByBarber = new Map<number, Interval[]>();
    for (const barberId of context.barberIds) {
      const barberWindow = context.barberWindows.get(`${barberId}:${weekday}`) ?? null;
      if (!salonWindow || !barberWindow) {
        windowsByBarber.set(barberId, []);
        continue;
      }
      const start = Math.max(salonWindow.start, barberWindow.start);
      const end = Math.min(salonWindow.end, barberWindow.end);
      windowsByBarber.set(barberId, end > start ? [{ start, end }] : []);
    }

    const [appointmentRows, blockRows, holdRows] = await Promise.all([
      context.barberIds.length
        ? db
            .select({
              id: appointments.id,
              barberId: appointments.barberId,
              startMin: appointments.startMin,
              barberEndMin: appointments.barberEndMin,
              status: appointments.status,
              createdAt: appointments.createdAt,
            })
            .from(appointments)
            .where(and(eq(appointments.date, date), inArray(appointments.barberId, context.barberIds)))
        : Promise.resolve([]),
      context.barberIds.length
        ? db
            .select({
              barberId: blockedTimes.barberId,
              startMin: blockedTimes.startMin,
              endMin: blockedTimes.endMin,
              fullDay: blockedTimes.fullDay,
            })
            .from(blockedTimes)
            .where(and(eq(blockedTimes.date, date), inArray(blockedTimes.barberId, context.barberIds)))
        : Promise.resolve([]),
      context.barberIds.length
        ? db
            .select({
              barberId: bookingHolds.barberId,
              startMin: bookingHolds.startMin,
              clientPhone: bookingHolds.clientPhone,
              duration: services.barberDurationMin,
              customDuration: barberServices.customBarberDuration,
              bufferMin: services.bufferMin,
            })
            .from(bookingHolds)
            .innerJoin(services, eq(bookingHolds.serviceId, services.id))
            .leftJoin(
              barberServices,
              and(
                eq(barberServices.barberId, bookingHolds.barberId),
                eq(barberServices.serviceId, bookingHolds.serviceId),
              ),
            )
            .where(
              and(
                eq(bookingHolds.date, date),
                inArray(bookingHolds.barberId, context.barberIds),
                gt(bookingHolds.expiresAt, new Date()),
              ),
            )
        : Promise.resolve([]),
    ]);

    const expiryCutoff = Date.now() - PENDING_GRACE_MS;
    const busyByBarber = new Map<number, Interval[]>();
    const blockedByBarber = new Map<number, Interval[]>();
    const push = (barberId: number, interval: Interval) => {
      const list = busyByBarber.get(barberId) ?? [];
      list.push(interval);
      busyByBarber.set(barberId, list);
    };
    const pushBlock = (barberId: number, interval: Interval) => {
      const list = blockedByBarber.get(barberId) ?? [];
      list.push(interval);
      blockedByBarber.set(barberId, list);
    };
    for (const row of appointmentRows) {
      if (CANCELLED.includes(row.status)) continue;
      if (excludedAppointmentIds?.has(row.id)) continue;
      if (row.status === "PENDING" && row.createdAt.getTime() < expiryCutoff) continue;
      push(row.barberId, { start: row.startMin, end: row.barberEndMin });
    }
    for (const row of blockRows) {
      const interval = { start: row.fullDay ? 0 : row.startMin, end: row.fullDay ? 24 * 60 : row.endMin };
      push(row.barberId, interval);
      pushBlock(row.barberId, interval);
    }
    for (const row of holdRows) {
      if (options.excludePhone && row.clientPhone === options.excludePhone) continue;
      const serviceNeed = row.customDuration ?? row.duration;
      push(row.barberId, { start: row.startMin, end: row.startMin + serviceNeed + row.bufferMin });
    }

    const days: BarberDay[] = context.barberIds.map((barberId) => ({
      barberId,
      windows: windowsByBarber.get(barberId) ?? [],
      busy: mergeIntervals(busyByBarber.get(barberId) ?? []),
      blocked: mergeIntervals(blockedByBarber.get(barberId) ?? []),
    }));

    const today = todayISO();
    return {
      date,
      services: context.services,
      barbers: context.barbers,
      offers: context.offers,
      days,
      nowMin: date === today ? salonMinuteOfDay() : null,
    };
  }

  return {
    today: () => todayISO(),
    nowMinuteOfDay: () => salonMinuteOfDay(),
    loadDay,
  };
}
