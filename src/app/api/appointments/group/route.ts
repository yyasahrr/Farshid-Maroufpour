/**
 * POST /api/appointments/group — commit one VISIT (possibly multi-service,
 * multi-staff, per attendee) as a single booking.
 *
 * The client sends only its selection and the one start time; every segment
 * time, every staff assignment and every price is recomputed server-side in
 * the same transaction. A matching plan hold is required: this endpoint never
 * re-derives availability from stale client state.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appointments, auditLogs, bookingHolds, notifications, payments } from "@/db/schema";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";
import { hasAcceptedPolicy } from "@/lib/auth-otp";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";
import { loadPlannerData } from "@/lib/visit-planner-data";
import { planVisit, type VisitPlan } from "@/lib/visit-planner";

const AttendeeSchema = z.object({
  attendeeId: z.string().trim().min(1).max(80),
  attendeeName: z.string().trim().min(2).max(60),
  serviceIds: z.array(z.number().int().positive()).min(1).max(12),
  barberId: z.number().int().positive().nullable().optional(),
});

export const GroupRequestBody = z.object({
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر است"),
  startMin: z.number().int().min(0).max(1439),
  attendees: z.array(AttendeeSchema).min(1).max(12),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });

  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "برای رزرو ابتدا با شماره موبایل وارد شوید." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = GroupRequestBody.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "اطلاعات رزرو نامعتبر است." },
      { status: 400 },
    );

  if (!(await hasAcceptedPolicy(user.id)))
    return NextResponse.json({ error: "لطفاً پیش از ثبت، قوانین رزرو را تأیید کنید." }, { status: 403 });
  if (!rateLimit(`appointment-group:${user.id}`, 4, 60_000))
    return NextResponse.json({ error: "درخواست‌های بیش از حد؛ یک دقیقه صبر کنید." }, { status: 429 });

  const { date, startMin, attendees } = parsed.data;
  const today = todayISO();
  if (date < today || date > addDaysISO(today, 60))
    return NextResponse.json({ error: "تاریخ نوبت‌ها باید در ۶۰ روز آینده باشد." }, { status: 400 });
  if (new Set(attendees.map((a) => a.attendeeId)).size !== attendees.length)
    return NextResponse.json({ error: "شرکت‌کننده تکراری است." }, { status: 400 });

  try {
    const result = await db.transaction(async (tx) => {
      // Lock candidate barber/days up front (all offering barbers, not just the
      // eventual assignment) so a concurrent competing plan serializes here.
      const lockRows = await tx.execute(sql`
        select distinct bs.barber_id from barber_services bs
        where bs.service_id in (${sql.join(
          [...new Set(attendees.flatMap((a) => a.serviceIds))].map((id) => sql`${id}`),
          sql`,`,
        )})
      `);
      const lockBarberIds: number[] = (lockRows as unknown as { rows?: { barber_id: number }[] }).rows?.map((r) => r.barber_id) ?? [];
      const lockKeys = [...new Set(lockBarberIds.map((b) => `${b}:${date}`))].sort();
      for (const lockKey of lockKeys)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

      // Server is the scheduling authority: rebuild the plan inside the lock.
      const planRequest = attendees.map((a) => ({
        attendeeId: a.attendeeId,
        serviceIds: a.serviceIds,
        barberId: a.barberId ?? null,
      }));
      const data = await loadPlannerData(date, planRequest, user.phone);
      const outcome = planVisit({ date, startMin, attendees: planRequest }, data);
      if (!outcome.plan) {
        const message = outcome.issues[0]?.message ?? "این زمان دیگر در دسترس نیست.";
        return { ok: false as const, error: message, nearby: outcome.nearby, status: 409 };
      }
      const plan = outcome.plan;

      // The plan must be exactly what the hold secured (or refreshed below).
      const activeHolds = await tx
        .select({
          barberId: bookingHolds.barberId,
          serviceId: bookingHolds.serviceId,
          date: bookingHolds.date,
          startMin: bookingHolds.startMin,
        })
        .from(bookingHolds)
        .where(and(eq(bookingHolds.clientPhone, user.phone), gt(bookingHolds.expiresAt, new Date())));
      const heldKeys = new Set(activeHolds.map((h) => `${h.barberId}|${h.serviceId}|${h.date}|${h.startMin}`));
      const planKeys = plan.segments.map((s) => `${s.barberId}|${s.serviceId}|${s.date}|${s.startMin}`);
      const fullyHeld = planKeys.length > 0 && planKeys.every((k) => heldKeys.has(k));
      if (!fullyHeld) {
        return {
          ok: false as const,
          error: "مهلت نگهداری این زمان تمام شده یا یکی از بخش‌های نوبت تغییر کرده است. زمان را دوباره تأیید کنید.",
          nearby: outcome.validStarts.slice(0, 3),
          status: 409,
        };
      }

      const onlineTotal = plan.amountDueOnline;
      const status = onlineTotal > 0 ? "PENDING" : plan.requiresManagerApproval ? "AWAITING_APPROVAL" : "CONFIRMED";
      const bookingGroupId = randomUUID();
      const created: { id: number }[] = [];
      const namesById = new Map(attendees.map((a) => [a.attendeeId, a.attendeeName]));
      for (const seg of plan.segments) {
        const [appointment] = await tx
          .insert(appointments)
          .values({
            barberId: seg.barberId,
            serviceId: seg.serviceId,
            clientName: namesById.get(seg.attendeeId) ?? user.name,
            clientPhone: user.phone,
            bookingGroupId,
            date: seg.date,
            startMin: seg.startMin,
            endMin: seg.clientEndMin,
            barberEndMin: seg.barberEndMin,
            priceSnapshot: seg.price,
            status,
            source: "ONLINE",
            notes: plan.requiresManagerApproval ? "نیازمند تأیید مدیر (طبق قوانین خدمت)" : "",
          })
          .returning({ id: appointments.id });
        created.push(appointment);
      }

      let paymentReference: string | null = null;
      if (onlineTotal > 0) {
        paymentReference = `AG-${created[0].id}-${randomUUID()}`;
        await tx.insert(payments).values({
          kind: "APPOINTMENT_GROUP",
          refId: created[0].id,
          amount: onlineTotal,
          status: "PENDING",
          reference: paymentReference,
        });
      }

      await tx.delete(bookingHolds).where(eq(bookingHolds.clientPhone, user.phone));
      await tx.insert(auditLogs).values({
        actor: `user:${user.id}`,
        action: "VISIT_BOOKING_CREATED",
        target: `booking-group:${bookingGroupId}`,
      });
      const when = `${date} ${String(Math.floor(plan.startMin / 60)).padStart(2, "0")}:${String(plan.startMin % 60).padStart(2, "0")}`;
      const perBarber = new Map<number, typeof plan.segments>();
      for (const seg of plan.segments) perBarber.set(seg.barberId, [...(perBarber.get(seg.barberId) ?? []), seg]);
      await tx.insert(notifications).values(
        [...perBarber.entries()].map(([barberId, segs]) => ({
          targetRole: "BARBER",
          userId: null as number | null,
          kind: "NEW_BOOKING",
          title: `نوبت جدید: ${user.name}`,
          body: `${segs.map((s) => s.serviceName).join(" + ")} — ${when} تا ${String(Math.floor(plan.endMin / 60)).padStart(2, "0")}:${String(plan.endMin % 60).padStart(2, "0")}`,
        })),
      );
      await tx.insert(notifications).values({
        targetRole: "SUPER_ADMIN",
        kind: "NEW_BOOKING",
        title: `رزرو جدید (${plan.segments.length} بخش)`,
        body: `${when} · کد گروه ${created[0].id}`,
      });

      return {
        ok: true as const,
        bookingGroupId,
        appointmentIds: created.map((c) => c.id),
        paymentReference,
        amountDueOnline: onlineTotal,
        remainingDue: plan.remainingDue,
        requiresManagerApproval: plan.requiresManagerApproval,
        plan,
        status,
      };
    });

    if (result.ok)
      return NextResponse.json(
        {
          ok: true,
          bookingGroupId: result.bookingGroupId,
          appointmentIds: result.appointmentIds,
          paymentReference: result.paymentReference,
          amountDueOnline: result.amountDueOnline,
          remainingDue: result.remainingDue,
          requiresManagerApproval: result.requiresManagerApproval,
          status: result.status,
          // Full server plan as the receipt's visit — identical shape the
          // wizard validated at plan/hold time; never a trimmed re-invention.
          visit: result.plan,
        },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    return NextResponse.json(
      { ok: false, error: result.error, nearby: "nearby" in result ? result.nearby : [] },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Visit booking creation failed", error);
    return NextResponse.json({ error: "ثبت نوبت انجام نشد؛ زمان‌ها را دوباره بررسی کنید." }, { status: 503 });
  }
}
