/**
 * Service catalogue: capability and pricing truth.
 *
 * One place decides «can this barber perform this service, and at what price and
 * duration». It is deliberately free of scheduling logic — the visit planner owns
 * time — but it is the same function the planner, the hold route, the visit
 * creation route and staff reassignment all call, so a plan can never contain an
 * assignment that the final transaction would reject.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { barberServices, barberSkills, barbers, services } from "@/db/schema";

export type ResolvedService = {
  id: number;
  name: string;
  /** Total time the client is receiving or waiting for the service. */
  durationMin: number;
  /** Time during which the assigned barber is occupied. */
  barberDurationMin: number;
  bufferMin: number;
  price: number;
  paymentMode: "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT";
  depositAmount: number;
  /** Amount that must be paid online before the appointment is secured. */
  amountDueOnline: number;
  /** Amount still payable at the salon. */
  remainingDue: number;
};

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

/**
 * Resolves one barber↔service pair.
 *
 * Requires: an active service, an active barber, an explicit assignment
 * (`barber_services`) and — when the service declares `requiredSkillId` — an
 * approved skill. Anything less returns `null`, which every caller treats as
 * «not offered», never as «try anyway».
 */
export async function resolveService(
  barberId: number,
  serviceId: number,
): Promise<ResolvedService | null> {
  const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!svc || !svc.active) return null;
  const [barber] = await db
    .select({ id: barbers.id })
    .from(barbers)
    .where(and(eq(barbers.id, barberId), eq(barbers.active, true)))
    .limit(1);
  if (!barber) return null;
  if (svc.requiredSkillId) {
    const [approvedSkill] = await db
      .select({ id: barberSkills.id })
      .from(barberSkills)
      .where(and(eq(barberSkills.barberId, barberId), eq(barberSkills.skillId, svc.requiredSkillId)))
      .limit(1);
    if (!approvedSkill) return null;
  }
  const [link] = await db
    .select()
    .from(barberServices)
    .where(and(eq(barberServices.barberId, barberId), eq(barberServices.serviceId, serviceId)))
    .limit(1);
  if (!link) return null;
  const price = link.customPrice ?? svc.basePrice;
  const { amountDueOnline, remainingDue } = splitPayment(
    price,
    svc.paymentMode as ResolvedService["paymentMode"],
    svc.depositAmount,
  );
  return {
    id: svc.id,
    name: svc.name,
    durationMin: link.customDuration ?? svc.durationMin,
    barberDurationMin: link.customBarberDuration ?? svc.barberDurationMin,
    bufferMin: svc.bufferMin,
    price,
    paymentMode: svc.paymentMode as ResolvedService["paymentMode"],
    depositAmount: svc.depositAmount,
    amountDueOnline,
    remainingDue,
  };
}
