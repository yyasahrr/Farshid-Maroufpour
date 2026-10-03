import { randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  appointments,
  auditLogs,
  bookingHolds,
  classRegistrations,
  classes,
  notifications,
  payments,
} from "@/db/schema";
import {
  buildSlots,
  getDayContext,
  resolveService,
  type ResolvedService,
} from "./availability";
import { isValidISODate, todayISO } from "./time";

export const CreateAppointmentSchema = z.object({
  barberId: z.coerce.number().int().positive(),
  serviceId: z.coerce.number().int().positive(),
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر است"),
  startMin: z.coerce.number().int().min(0).max(1439),
  clientName: z.string().trim().min(2).max(60),
  clientPhone: z
    .string()
    .trim()
    .regex(/^09\d{9}$/, "شماره موبایل معتبر نیست"),
  notes: z.string().trim().max(300).optional().default(""),
  source: z
    .enum(["ONLINE", "WALK_IN", "RECEPTION"])
    .optional()
    .default("ONLINE"),
});

export type BookingResult =
  | {
      ok: true;
      appointmentId: number;
      paymentReference: string | null;
      amountDueOnline: number;
      remainingDue: number;
      paymentMode: ResolvedService["paymentMode"];
    }
  | { ok: false; error: string };

export async function createAppointment(
  input: z.infer<typeof CreateAppointmentSchema>,
  actor = "client",
): Promise<BookingResult> {
  if (input.date < todayISO())
    return { ok: false, error: "تاریخ گذشته قابل رزرو نیست." };
  const service = await resolveService(input.barberId, input.serviceId);
  if (!service)
    return { ok: false, error: "این سرویس توسط آرایشگر ارائه نمی‌شود." };

  try {
    return await db.transaction(async (tx) => {
      // serialize concurrent bookings for the same barber/day
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${input.barberId}:${input.date}`}))`,
      );

      await tx.update(appointments).set({ status: "CANCELLED_BY_CLIENT" }).where(and(
        eq(appointments.barberId, input.barberId), eq(appointments.date, input.date),
        eq(appointments.status, "PENDING"), lt(appointments.createdAt, new Date(Date.now() - 10 * 60_000)),
      ));
      const ctx = await getDayContext(input.barberId, input.date, input.clientPhone);
      const slots = buildSlots(
        ctx,
        service.barberDurationMin,
        service.bufferMin,
        input.date,
      );
      const slot = slots.find((s) => s.startMin === input.startMin);
      if (!slot || slot.state !== "AVAILABLE") {
        return { ok: false as const, error: "این زمان دیگر در دسترس نیست." };
      }

      const requiresOnlinePayment = input.source === "ONLINE" && service.amountDueOnline > 0;
      const [created] = await tx.insert(appointments).values({
        barberId: input.barberId,
        serviceId: input.serviceId,
        clientName: input.clientName,
        clientPhone: input.clientPhone,
        date: input.date,
        startMin: input.startMin,
        endMin: input.startMin + service.durationMin,
        barberEndMin: input.startMin + service.barberDurationMin + service.bufferMin,
        priceSnapshot: service.price,
        status: input.source === "WALK_IN" ? "CHECKED_IN" : requiresOnlinePayment ? "PENDING" : "CONFIRMED",
        source: input.source,
        notes: input.notes ?? "",
      }).returning();

      // The appointment supersedes the temporary hold within the same locked transaction.
      await tx.delete(bookingHolds).where(and(
        eq(bookingHolds.barberId, input.barberId), eq(bookingHolds.date, input.date),
        eq(bookingHolds.clientPhone, input.clientPhone),
      ));
      let reference: string | null = null;
      if (requiresOnlinePayment) {
        reference = `AP-${created.id}-${randomUUID()}`;
        await tx.insert(payments).values({
          kind: "APPOINTMENT",
          refId: created.id,
          amount: service.amountDueOnline,
          status: "PENDING",
          reference,
        });
      }

      await tx
        .insert(auditLogs)
        .values({
          actor,
          action: "APPOINTMENT_CREATED",
          target: `appointment:${created.id}`,
        });

      const when = `${input.date} ${Math.floor(input.startMin / 60)}:${String(input.startMin % 60).padStart(2, "0")}`;
      await tx.insert(notifications).values({
        targetRole: "BARBER",
        kind: "NEW_BOOKING",
        title: `نوبت جدید ${input.clientName}`,
        body: `${service.name} — ${when}`,
      });
      await tx.insert(notifications).values({
        targetRole: "SUPER_ADMIN",
        kind: "NEW_BOOKING",
        title: `رزرو جدید: ${input.clientName}`,
        body: `${service.name} — ${when}`,
      });

      return {
        ok: true as const,
        appointmentId: created.id,
        paymentReference: reference,
        amountDueOnline: requiresOnlinePayment ? service.amountDueOnline : 0,
        remainingDue: requiresOnlinePayment ? service.remainingDue : service.price,
        paymentMode: requiresOnlinePayment ? service.paymentMode : "NO_PAYMENT" as const,
      };
    });
  } catch {
    return { ok: false, error: "این زمان همزمان توسط شخص دیگری رزرو شد." };
  }
}

export const ClassRegistrationSchema = z.object({
  classId: z.coerce.number().int().positive(),
  studentName: z.string().trim().min(2).max(60),
  studentPhone: z
    .string()
    .trim()
    .regex(/^09\d{9}$/, "شماره موبایل معتبر نیست"),
});

export async function registerForClass(
  input: z.infer<typeof ClassRegistrationSchema>,
): Promise<
  { ok: true; registrationId: number; paymentReference: string | null } | { ok: false; error: string }
> {
  try {
    return await db.transaction(async (tx) => {
      const updated = await tx
        .update(classes)
        .set({ seatsTaken: sql`${classes.seatsTaken} + 1` })
        .where(
          and(
            eq(classes.id, input.classId),
            eq(classes.status, "OPEN"),
            sql`${classes.seatsTaken} < ${classes.capacity}`,
          ),
        )
        .returning();

      if (updated.length === 0) {
        return { ok: false as const, error: "ظرفیت این کلاس تکمیل شده است." };
      }

      const [reg] = await tx
        .insert(classRegistrations)
        .values({
          classId: input.classId,
          studentName: input.studentName,
          studentPhone: input.studentPhone,
          status: updated[0].price > 0 ? "PENDING" : "CONFIRMED",
        })
        .returning();

      let paymentReference: string | null = null;
      if (updated[0].price > 0) {
        paymentReference = `CL-${reg.id}-${randomUUID()}`;
        await tx.insert(payments).values({
          kind: "CLASS",
          refId: reg.id,
          amount: updated[0].price,
          status: "PENDING",
          reference: paymentReference,
        });
      }

      await tx.insert(notifications).values({
        targetRole: "SUPER_ADMIN",
        kind: "WORKSHOP_REGISTRATION",
        title: `ثبت‌نام جدید: ${input.studentName}`,
        body: `${updated[0].title}`,
      });

      return { ok: true as const, registrationId: reg.id, paymentReference };
    });
  } catch {
    return {
      ok: false,
      error: "ثبت‌نام انجام نشد. احتمالاً قبلاً ثبت‌نام کرده‌اید.",
    };
  }
}
