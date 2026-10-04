/**
 * Server-side prefetch for the visit planner. Resolves every (attendee, service)
 * pair to eligible barber candidates — price, durations and skill approval all
 * come from the database, never from the client.
 */

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { barberServices, barbers, serviceCombinationRules } from "@/db/schema";
import {
  getDayContext,
  resolveService,
  type DayContext,
} from "./availability";
import {
  PLANNER_LIMITS,
  type AttendeeRequest,
  type BarberCandidate,
  type CombinationRule,
  type PlannerData,
} from "./visit-planner";
import { salonMinuteOfDay, todayISO } from "./time";

export async function loadCombinationRules(serviceIds: number[]): Promise<CombinationRule[]> {
  if (serviceIds.length < 2) return [];
  const rows = await db
    .select()
    .from(serviceCombinationRules)
    .where(inArray(serviceCombinationRules.serviceAId, serviceIds));
  const set = new Set(serviceIds);
  return rows
    .filter((r) => set.has(r.serviceBId))
    .map((r) => ({
      a: r.serviceAId,
      b: r.serviceBId,
      canCombine: r.canCombine,
      sameBarberRequired: r.sameBarberRequired,
      note: r.note,
    }));
}

/**
 * Candidates per `${attendeeId}:${serviceId}`. A barber is a candidate only if
 * the service is active, they offer it, their skill is APPROVED, and the
 * service resolves for them. DayContext (shift/break/blocks/holds/classes/
 * existing bookings) is fetched once per barber for the date.
 */
export async function loadPlannerData(
  date: string,
  attendees: AttendeeRequest[],
  clientPhone?: string,
): Promise<PlannerData> {
  const serviceIds = [...new Set(attendees.flatMap((a) => a.serviceIds))];
  const candidates = new Map<string, BarberCandidate[]>();
  const ctxCache = new Map<number, Promise<DayContext>>();
  const barberNames = new Map<number, string>();

  if (serviceIds.length > 0) {
    const links = await db
      .select({ barberId: barberServices.barberId, serviceId: barberServices.serviceId })
      .from(barberServices)
      .where(inArray(barberServices.serviceId, serviceIds));
    const barberIds = [...new Set(links.map((l) => l.barberId))];
    const barberRows = barberIds.length
      ? await db
          .select({ id: barbers.id, name: barbers.name, slug: barbers.slug, active: barbers.active })
          .from(barbers)
          .where(inArray(barbers.id, barberIds))
      : [];
    const eligibleBarbers = barberRows.filter((b) => b.active);
    for (const b of eligibleBarbers) barberNames.set(b.id, b.name);

    for (const barber of eligibleBarbers) {
      ctxCache.set(barber.id, getDayContext(barber.id, date, clientPhone));
    }

    for (const attendee of attendees) {
      for (const serviceId of attendee.serviceIds) {
        const key = `${attendee.attendeeId}:${serviceId}`;
        if (candidates.has(key)) continue;
        const offeringBarberIds = links
          .filter((l) => l.serviceId === serviceId)
          .map((l) => l.barberId);
        const resolved: BarberCandidate[] = [];
        for (const barber of eligibleBarbers) {
          if (!offeringBarberIds.includes(barber.id)) continue;
          const service = await resolveService(barber.id, serviceId);
          if (!service) continue;
          const ctx = await (ctxCache.get(barber.id) ?? getDayContext(barber.id, date, clientPhone));
          resolved.push({
            barberId: barber.id,
            barberName: barber.name,
            barberSlug: barber.slug,
            ctx,
            service,
          });
        }
        // Candidate order is the barber table order — deterministic across
        // requests so the same selection yields the same suggested plan.
        candidates.set(key, resolved);
      }
    }
  }

  return {
    candidates,
    rules: await loadCombinationRules(serviceIds),
    now: { date: todayISO(), minute: salonMinuteOfDay() },
    ...PLANNER_LIMITS,
    barberNames,
  };
}
