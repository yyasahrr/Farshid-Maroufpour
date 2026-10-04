/**
 * POST /api/booking/hold — hold the ENTIRE scheduling plan, not one slot.
 *
 * The client sends services + the one start time it is looking at; the server
 * runs the visit planner itself and holds every resulting segment under one
 * planId with one expiry. A hold can never cover only part of a visit: if any
 * segment stops fitting, nothing is held and the response offers nearby starts.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appointments, bookingHolds } from "@/db/schema";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";
import { getCurrentUser } from "@/lib/session";
import { normalizeIranianMobile } from "@/lib/auth-otp";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";
import { loadPlannerData } from "@/lib/visit-planner-data";
import { planVisit, type VisitPlan } from "@/lib/visit-planner";

const AttendeeSchema = z.object({
  attendeeId: z.string().trim().min(1).max(80),
  serviceIds: z.array(z.number().int().positive()).min(1).max(12),
  barberId: z.number().int().positive().nullable().optional(),
  servicePins: z
    .array(z.object({ serviceId: z.number().int().positive(), barberId: z.number().int().positive() }))
    .max(24)
    .nullable()
    .optional(),
});

const HoldSchema = z.object({
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر است"),
  startMin: z.number().int().min(0).max(1439),
  attendees: z.array(AttendeeSchema).min(1).max(12),
  /** Guest checkout: holds are keyed by phone, so an unauthenticated wizard can
   *  secure the plan with the same phone it will later register with. */
  contactPhone: z.string().trim().max(20).optional(),
  /** Before any phone is typed the wizard holds the slot under a random
   *  browser token; the same token re-keys the hold to the phone on submit. */
  holdToken: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
});

const HOLD_SECONDS = 10 * 60;

export async function POST(request: Request) {
  // Reject cross-site posts before touching the session or the database.
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = HoldSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "اطلاعات زمان نامعتبر است." }, { status: 400 });

  // Login is NOT a precondition of holding time anymore: identity arrives at
  // the review step. Keyed by phone either way, so a later login/guest account
  // with the same number inherits the hold untouched.
  const user = await getCurrentUser();
  const { holdToken } = parsed.data;
  const anonKey = holdToken ? `anon:${holdToken}` : null;
  const phone = user?.phone ?? normalizeIranianMobile(parsed.data.contactPhone ?? "") ?? anonKey;
  if (!phone)
    return NextResponse.json(
      { error: user ? "حساب شما شمارهٔ معتبر ندارد." : "برای نگه‌داشتن زمان، شماره موبایل لازم است." },
      { status: 401 },
    );

  const today = todayISO();
  const { date, startMin, attendees } = parsed.data;
  if (date < today || date > addDaysISO(today, 60))
    return NextResponse.json({ error: "تاریخ باید در ۶۰ روز آینده باشد." }, { status: 400 });
  if (!rateLimit(user ? `hold:user:${user.id}` : `hold:key:${phone}`, 12, 60_000))
    return NextResponse.json({ error: "درخواست‌های بیش از حد؛ یک دقیقه صبر کنید." }, { status: 429 });


  try {
    // Expire abandoned unauthenticated holds and stale pending rows first.
    await db.delete(bookingHolds).where(lt(bookingHolds.expiresAt, new Date()));
    // Re-keying (token hold → phone hold): the anon rows are ours; clear them
    // so the fresh hold below is not blocked by its own previous claim.
    if (anonKey && anonKey !== phone)
      await db.delete(bookingHolds).where(eq(bookingHolds.clientPhone, anonKey));
    await db.update(appointments).set({ status: "CANCELLED_BY_CLIENT" }).where(and(
      eq(appointments.status, "PENDING"),
      lt(appointments.createdAt, new Date(Date.now() - HOLD_SECONDS * 1000)),
      sql`${appointments.source} = 'ONLINE'`,
    ));

    const data = await loadPlannerData(date, attendees, phone);
    const outcome = planVisit({ date, startMin, attendees }, data);
    if (!outcome.plan) {
      return NextResponse.json(
        { ok: false as const, error: outcome.issues[0]?.message ?? "این زمان دیگر در دسترس نیست.", nearby: outcome.nearby },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const plan = outcome.plan;

    const result = await db.transaction(async (tx) => {
      const lockKeys = [...new Set(plan.segments.map((s) => `${s.barberId}:${s.date}`))].sort();
      for (const lockKey of lockKeys)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

      // Re-verify inside the lock: the plan must still fit exactly as computed.
      const txData = await loadPlannerData(date, attendees, phone);
      const txOutcome = planVisit({ date, startMin, attendees }, txData);
      if (!txOutcome.plan || !samePlan(txOutcome.plan, plan))
        return { ok: false as const, error: "این زمان لحظاتی پیش رزرو شد.", nearby: txOutcome.nearby };

      await tx.delete(bookingHolds).where(eq(bookingHolds.clientPhone, phone));
      const planId = randomUUID();
      const expiresAt = new Date(Date.now() + HOLD_SECONDS * 1000);
      const holds = await tx.insert(bookingHolds).values(
        plan.segments.map((seg) => ({
          planId,
          barberId: seg.barberId,
          serviceId: seg.serviceId,
          date: seg.date,
          startMin: seg.startMin,
          durationMin: seg.barberDurationMin + seg.bufferMin,
          clientPhone: phone,
          expiresAt,
        })),
      ).returning({ id: bookingHolds.id });
      return { ok: true as const, planId, holdIds: holds.map((h) => h.id), expiresAt: expiresAt.toISOString(), holdDurationSec: HOLD_SECONDS };
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false as const, error: result.error, nearby: result.nearby ?? outcome.nearby },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true as const, plan, expiresAt: result.expiresAt, holdDurationSec: HOLD_SECONDS, planId: result.planId },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Booking hold creation failed", error);
    return NextResponse.json({ error: "ثبت موقت زمان انجام نشد. دوباره تلاش کنید." }, { status: 503 });
  }
}

function samePlan(a: VisitPlan, b: VisitPlan): boolean {
  if (a.startMin !== b.startMin || a.endMin !== b.endMin || a.segments.length !== b.segments.length) return false;
  const key = (p: VisitPlan) =>
    p.segments
      .map((s) => `${s.attendeeId}|${s.barberId}|${s.serviceId}|${s.startMin}`)
      .sort()
      .join(";");
  return key(a) === key(b);
}
