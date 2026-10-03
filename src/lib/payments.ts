import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  auditLogs,
  classRegistrations,
  notifications,
  payments,
} from "@/db/schema";

export type VerifyOutcome = { status: "PAID" | "FAILED" | "PENDING" | "CANCELLED"; idempotent: boolean };

/** Called only by a verified provider callback or an explicitly enabled, owner-authenticated preview payment. */
export async function verifyPayment(reference: string, providerStatus: "OK" | "FAILED"):
  Promise<VerifyOutcome | { error: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from payments where reference = ${reference} for update`);
    const [row] = await tx.select().from(payments).where(eq(payments.reference, reference)).limit(1);
    if (!row) return { error: "پرداخت یافت نشد." };
    if (row.kind !== "APPOINTMENT" && row.kind !== "APPOINTMENT_GROUP" && row.kind !== "CLASS")
      return { error: "نوع پرداخت نامعتبر است." };
    if (row.status !== "PENDING") {
      const status = row.status === "PAID" || row.status === "FAILED" || row.status === "CANCELLED"
        ? row.status : "CANCELLED";
      return { status, idempotent: true };
    }
    if (row.kind === "APPOINTMENT") {
      const [appt] = await tx.select().from(appointments).where(eq(appointments.id, row.refId)).limit(1);
      if (!appt || appt.status.startsWith("CANCELLED")) return { error: "نوبت لغو شده است؛ پرداخت امکان‌پذیر نیست." };
      if (appt.status === "PENDING" && Date.now() - appt.createdAt.getTime() > 10 * 60_000) {
        await tx.update(appointments).set({ status: "CANCELLED_BY_CLIENT" }).where(eq(appointments.id, appt.id));
        await tx.update(payments).set({ status: "CANCELLED" }).where(eq(payments.id, row.id));
        return { error: "مهلت پرداخت این نوبت به پایان رسید. زمان دیگری انتخاب کنید." };
      }
      if (appt.status !== "PENDING" && appt.status !== "CONFIRMED")
        return { error: "وضعیت نوبت برای پرداخت معتبر نیست." };
      if (providerStatus === "OK" && appt.status === "PENDING")
        await tx.update(appointments).set({ status: "CONFIRMED" }).where(eq(appointments.id, appt.id));
    }
    if (row.kind === "APPOINTMENT_GROUP") {
      const [firstAppointment] = await tx.select().from(appointments)
        .where(eq(appointments.id, row.refId)).limit(1);
      if (!firstAppointment?.bookingGroupId)
        return { error: "گروه نوبت‌های این پرداخت یافت نشد." };
      const groupAppointments = await tx.select().from(appointments)
        .where(eq(appointments.bookingGroupId, firstAppointment.bookingGroupId));
      if (
        groupAppointments.length === 0 ||
        groupAppointments.some((appointment) => appointment.status.startsWith("CANCELLED"))
      )
        return { error: "یکی از نوبت‌های این گروه لغو شده است." };
      const expired = groupAppointments.some((appointment) =>
        appointment.status === "PENDING" &&
        Date.now() - appointment.createdAt.getTime() > 10 * 60_000
      );
      if (expired) {
        await tx.update(appointments).set({ status: "CANCELLED_BY_CLIENT" })
          .where(eq(appointments.bookingGroupId, firstAppointment.bookingGroupId));
        await tx.update(payments).set({ status: "CANCELLED" }).where(eq(payments.id, row.id));
        return { error: "مهلت پرداخت این گروه به پایان رسید. زمان‌های دیگری انتخاب کنید." };
      }
      if (groupAppointments.some((appointment) => appointment.status !== "PENDING" && appointment.status !== "CONFIRMED"))
        return { error: "وضعیت یکی از نوبت‌های این گروه برای پرداخت معتبر نیست." };
      if (providerStatus === "OK")
        await tx.update(appointments).set({ status: "CONFIRMED" }).where(and(
          eq(appointments.bookingGroupId, firstAppointment.bookingGroupId),
          eq(appointments.status, "PENDING"),
        ));
    }
    if (row.kind === "CLASS") {
      const [registration] = await tx.select().from(classRegistrations)
        .where(eq(classRegistrations.id, row.refId)).limit(1);
      if (!registration || registration.status === "CANCELLED") return { error: "ثبت‌نام دوره دیگر فعال نیست." };
      if (providerStatus === "OK" && registration.status === "PENDING")
        await tx.update(classRegistrations).set({ status: "CONFIRMED" })
          .where(eq(classRegistrations.id, registration.id));
    }
    const status = providerStatus === "OK" ? "PAID" : "FAILED";
    await tx.update(payments).set({ status }).where(eq(payments.id, row.id));
    await tx.insert(auditLogs).values({ actor: "verified-payment", action: "PAYMENT_VERIFIED", target: reference });
    if (status === "PAID") {
      await tx.insert(notifications).values({
        targetRole: "SUPER_ADMIN",
        kind: "PAYMENT_RECEIVED",
        title: `پرداخت ${row.kind === "CLASS" ? "شهریه" : "بیعانه"} دریافت شد`,
        body: `${reference} — ${row.amount.toLocaleString("fa-IR")} تومان`,
      });
      if (row.kind === "APPOINTMENT" || row.kind === "APPOINTMENT_GROUP") {
        await tx.insert(notifications).values({
          targetRole: "BARBER",
          kind: "PAYMENT_RECEIVED",
          title: row.kind === "APPOINTMENT_GROUP" ? "پرداخت رزرو گروهی دریافت شد" : "پرداخت بیعانه دریافت شد",
          body: `${reference}`,
        });
      }
    }
    return { status, idempotent: false };
  });
}

/** Production callbacks must use a distinct secret issued to the payment provider. */
export function paymentSignature(reference: string, providerStatus: "OK" | "FAILED"): string {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) throw new Error("PAYMENT_WEBHOOK_SECRET is not configured");
  return createHmac("sha256", secret).update(`${reference}:${providerStatus}`).digest("hex");
}

export function verifyPaymentSignature(reference: string, providerStatus: "OK" | "FAILED", signature: string | null): boolean {
  if (!signature || !process.env.PAYMENT_WEBHOOK_SECRET || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = paymentSignature(reference, providerStatus);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
