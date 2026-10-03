import { NextResponse } from "next/server";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appointments, auditLogs, payments } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { currentEpochMs } from "@/lib/time";
import { isSameOriginRequest } from "@/lib/same-origin";

const CancelSchema = z.object({ appointmentId: z.number().int().positive().max(2147483647) });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "برای لغو نوبت وارد حساب شوید." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = CancelSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "شناسه نوبت نامعتبر است." }, { status: 400 });
  const { appointmentId } = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const [initialAppointment] = await tx.select().from(appointments)
        .where(eq(appointments.id, appointmentId)).limit(1);
      if (!initialAppointment)
        return { ok: false as const, status: 404, error: "نوبت یافت نشد." };
      const groupAppointments = initialAppointment.bookingGroupId
        ? await tx.select().from(appointments)
          .where(eq(appointments.bookingGroupId, initialAppointment.bookingGroupId))
        : [initialAppointment];
      const groupFirstId = Math.min(...groupAppointments.map((item) => item.id));
      const [payment] = await tx.select().from(payments).where(or(
        and(eq(payments.kind, "APPOINTMENT"), eq(payments.refId, appointmentId)),
        and(eq(payments.kind, "APPOINTMENT_GROUP"), eq(payments.refId, groupFirstId)),
      )).limit(1);
      if (payment) await tx.execute(sql`select id from payments where id = ${payment.id} for update`);
      for (const id of groupAppointments.map((item) => item.id).sort((a, b) => a - b))
        await tx.execute(sql`select id from appointments where id = ${id} for update`);
      const [appt] = await tx.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
      if (!appt) return { ok: false as const, status: 404, error: "نوبت یافت نشد." };
      const isOwner = appt.clientPhone === user.phone;
      // Permission-based: reception/manager cancel anything; a barber only their own visit.
      const isStaff =
        user.permissions.has("booking:manage") ||
        (user.permissions.has("booking:self") &&
          groupAppointments.every((item) => user.barberId === item.barberId));
      if (!isOwner && !isStaff) return { ok: false as const, status: 403, error: "به این نوبت دسترسی ندارید." };
      if (groupAppointments.some((item) => item.status.startsWith("CANCELLED") || item.status === "COMPLETED" || item.status === "NO_SHOW"))
        return { ok: false as const, status: 409, error: "این نوبت دیگر قابل لغو نیست." };
      const hasStarted = groupAppointments.some((item) => {
        const startsAt = Date.parse(`${item.date}T00:00:00Z`) + (item.startMin - 210) * 60_000;
        return item.status === "IN_PROGRESS" || item.status === "CHECKED_IN" || startsAt <= currentEpochMs();
      });
      if (!isStaff && hasStarted)
        return { ok: false as const, status: 409, error: "برای تغییر نوبت شروع‌شده با پذیرش تماس بگیرید." };
      if (payment?.status === "PAID" && !isStaff)
        return { ok: false as const, status: 409, error: "برای لغو نوبت دارای پرداخت تأییدشده و هماهنگی وجه، با پذیرش تماس بگیرید." };
      if (appt.bookingGroupId) {
        await tx.update(appointments).set({ status: isOwner ? "CANCELLED_BY_CLIENT" : "CANCELLED_BY_STAFF" })
          .where(eq(appointments.bookingGroupId, appt.bookingGroupId));
      } else {
        await tx.update(appointments).set({ status: isOwner ? "CANCELLED_BY_CLIENT" : "CANCELLED_BY_STAFF" }).where(eq(appointments.id, appointmentId));
      }
      if (payment && (payment.status === "PENDING" || payment.status === "FAILED"))
        await tx.update(payments).set({ status: "CANCELLED" }).where(eq(payments.id, payment.id));
      await tx.insert(auditLogs).values({ actor: `user:${user.id}`, action: "APPOINTMENT_CANCELLED", target: `appointment:${appointmentId}` });
      return { ok: true as const, status: 200, warning: payment?.status === "PAID" ? "پرداخت تأییدشده نیازمند بررسی استرداد توسط پذیرش است." : null };
    });
    return NextResponse.json(result.ok ? { ok: true, warning: result.warning } : { error: result.error }, { status: result.status });
  } catch (error) {
    console.error("Appointment cancellation failed", error);
    return NextResponse.json({ error: "لغو نوبت انجام نشد؛ دوباره تلاش کنید." }, { status: 503 });
  }
}
