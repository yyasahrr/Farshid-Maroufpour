import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appointments, auditLogs, bookingHolds, notifications, payments } from "@/db/schema";
import { resolveService } from "@/lib/availability";
import { createDbPlannerSource } from "@/lib/visit-planner-db";
import { validateVisitItems } from "@/lib/visit-planner";
import { bookingGroupConflict } from "@/lib/booking-group";
import { hasAcceptedPolicy } from "@/lib/auth-otp";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";

const GroupItemSchema = z.object({
  attendeeId: z.string().trim().min(1).max(80),
  attendeeName: z.string().trim().min(2).max(60),
  barberId: z.number().int().positive(),
  serviceId: z.number().int().positive(),
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر است"),
  startMin: z.number().int().min(0).max(1439),
});

const GroupSchema = z.object({
  items: z.array(GroupItemSchema).min(1).max(12),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "برای رزرو ابتدا با شماره موبایل وارد شوید." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = GroupSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "اطلاعات رزرو گروهی نامعتبر است." }, { status: 400 });

  if (!(await hasAcceptedPolicy(user.id)))
    return NextResponse.json({ error: "لطفاً پیش از ثبت، قوانین رزرو را تأیید کنید." }, { status: 403 });
  if (!rateLimit(`appointment-group:${user.id}`, 4, 60_000))
    return NextResponse.json({ error: "درخواست‌های بیش از حد؛ یک دقیقه صبر کنید." }, { status: 429 });

  const { items } = parsed.data;
  const today = todayISO();
  if (items.some((item) => item.date < today || item.date > addDaysISO(today, 60)))
    return NextResponse.json({ error: "تاریخ نوبت‌ها باید در ۶۰ روز آینده باشد." }, { status: 400 });

  try {
    const result = await db.transaction(async (tx) => {
      const lockKeys = [...new Set(items.map(({ barberId, date }) => `${barberId}:${date}`))].sort();
      for (const lockKey of lockKeys)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

      const now = new Date();
      const activeHolds = await tx.select({
        barberId: bookingHolds.barberId,
        serviceId: bookingHolds.serviceId,
        date: bookingHolds.date,
        startMin: bookingHolds.startMin,
      }).from(bookingHolds)
        .where(and(eq(bookingHolds.clientPhone, user.phone), gt(bookingHolds.expiresAt, now)));
      const heldKeys = activeHolds
        .map((item) => `${item.barberId}:${item.serviceId}:${item.date}:${item.startMin}`)
        .sort();
      const requestedKeys = items
        .map((item) => `${item.barberId}:${item.serviceId}:${item.date}:${item.startMin}`)
        .sort();
      if (
        heldKeys.length !== requestedKeys.length ||
        heldKeys.some((key, index) => key !== requestedKeys[index])
      )
        return { ok: false as const, error: "مهلت نگهداری یکی از زمان‌ها تمام شده است؛ زمان‌ها را دوباره بررسی کنید." };

      type ResolvedItem = (typeof items)[number] & {
        service: NonNullable<Awaited<ReturnType<typeof resolveService>>>;
      };
      const resolved: ResolvedItem[] = [];
      const attendeeNames = new Map<string, string>();
      for (const item of items) {
        const savedName = attendeeNames.get(item.attendeeId);
        if (savedName && savedName !== item.attendeeName)
          return { ok: false as const, error: "نام همراه در نوبت‌های گروه یکسان نیست." };
        attendeeNames.set(item.attendeeId, item.attendeeName);

        await tx.update(appointments).set({ status: "CANCELLED_BY_CLIENT" }).where(and(
          eq(appointments.barberId, item.barberId),
          eq(appointments.date, item.date),
          eq(appointments.status, "PENDING"),
          lt(appointments.createdAt, new Date(Date.now() - 10 * 60_000)),
        ));
        const service = await resolveService(item.barberId, item.serviceId);
        if (!service)
          return { ok: false as const, error: "یکی از آرایشگران این خدمت را ارائه نمی‌دهد." };
        resolved.push({ ...item, service });
      }

      const conflict = bookingGroupConflict(resolved.map((item) => ({
        attendeeId: item.attendeeId,
        barberId: item.barberId,
        date: item.date,
        startMin: item.startMin,
        barberDurationMin: item.service.barberDurationMin,
        bufferMin: item.service.bufferMin,
        clientDurationMin: item.service.durationMin,
      })));
      if (conflict) return { ok: false as const, error: conflict };

      // Final server-side revalidation of every segment with the visit planner:
      // capability, working hours, blocked time, holds, existing bookings and
      // per-attendee overlap. Client-supplied times are never trusted.
      const plannerSource = createDbPlannerSource({
        serviceIds: resolved.map((item) => item.serviceId),
        excludePhone: user.phone,
      });
      const validation = await validateVisitItems(
        plannerSource,
        resolved.map((item) => ({
          attendeeId: item.attendeeId,
          barberId: item.barberId,
          serviceId: item.serviceId,
          date: item.date,
          startMin: item.startMin,
        })),
      );
      if (!validation.ok) return { ok: false as const, error: validation.error };

      const onlineTotal = resolved.reduce((sum, item) => sum + item.service.amountDueOnline, 0);
      const bookingGroupId = randomUUID();
      const status = onlineTotal > 0 ? "PENDING" : "CONFIRMED";
      const created: { id: number }[] = [];
      for (const item of resolved) {
        const [appointment] = await tx.insert(appointments).values({
          barberId: item.barberId,
          serviceId: item.serviceId,
          clientName: item.attendeeName,
          clientPhone: user.phone,
          bookingGroupId,
          date: item.date,
          startMin: item.startMin,
          endMin: item.startMin + item.service.durationMin,
          barberEndMin: item.startMin + item.service.barberDurationMin + item.service.bufferMin,
          priceSnapshot: item.service.price,
          status,
          source: "ONLINE",
        }).returning({ id: appointments.id });
        created.push(appointment);
      }

      let paymentReference: string | null = null;
      if (onlineTotal > 0) {
        const paymentAppointmentId = Math.min(...created.map((appointment) => appointment.id));
        paymentReference = `AG-${paymentAppointmentId}-${randomUUID()}`;
        await tx.insert(payments).values({
          kind: "APPOINTMENT_GROUP",
          refId: paymentAppointmentId,
          amount: onlineTotal,
          status: "PENDING",
          reference: paymentReference,
        });
      }

      await tx.delete(bookingHolds).where(eq(bookingHolds.clientPhone, user.phone));
      await tx.insert(auditLogs).values({
        actor: `user:${user.id}`,
        action: "APPOINTMENT_GROUP_CREATED",
        target: `booking-group:${bookingGroupId}`,
      });
      const groupCode = Math.min(...created.map((appointment) => appointment.id));
      await tx.insert(notifications).values(resolved.map((item) => ({
        targetRole: "BARBER",
        kind: "NEW_BOOKING",
        title: `نوبت گروهی جدید: ${item.attendeeName}`,
        body: `${item.service.name} — ${item.date} ${Math.floor(item.startMin / 60)}:${String(item.startMin % 60).padStart(2, "0")}`,
      })));
      await tx.insert(notifications).values({
        targetRole: "SUPER_ADMIN",
        kind: "NEW_BOOKING",
        title: `رزرو گروهی جدید (${items.length} نوبت)`,
        body: `کد گروه ${groupCode}`,
      });

      return {
        ok: true as const,
        bookingGroupId,
        appointmentIds: created.map((appointment) => appointment.id),
        paymentReference,
        amountDueOnline: onlineTotal,
        remainingDue: resolved.reduce((sum, item) => sum + item.service.remainingDue, 0),
      };
    });
    return NextResponse.json(result, {
      status: result.ok ? 201 : 409,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Group appointment creation failed", error);
    return NextResponse.json({ error: "ثبت نوبت‌های گروهی انجام نشد؛ زمان‌ها را دوباره بررسی کنید." }, { status: 503 });
  }
}
