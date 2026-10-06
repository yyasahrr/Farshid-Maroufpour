import { NextResponse } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appointments, bookingHolds } from "@/db/schema";
import { resolveService } from "@/lib/availability";
import { createDbPlannerSource } from "@/lib/visit-planner-db";
import { validateVisitItems } from "@/lib/visit-planner";
import { bookingGroupConflict } from "@/lib/booking-group";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";

const HoldItemSchema = z.object({
  barberId: z.number().int().positive(),
  serviceId: z.number().int().positive(),
  date: z.string().refine(isValidISODate),
  startMin: z.number().int().min(0).max(1439),
  attendeeId: z.string().trim().min(1).max(80).optional().default("primary"),
});
const HoldSchema = z.preprocess(
  (value) => value && typeof value === "object" && !("items" in value)
    ? { items: [value] }
    : value,
  z.object({ items: z.array(HoldItemSchema).min(1).max(12) }),
);

export async function POST(request: Request) {
  // Reject cross-site posts before touching the session or the database.
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  const user = await getCurrentUser();
  const body: unknown = await request.json().catch(() => null);
  const parsed = HoldSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "اطلاعات زمان نامعتبر است." }, { status: 400 });
  if (!user || !user.name.trim())
    return NextResponse.json({ error: "ابتدا با شماره موبایل وارد حساب شوید." }, { status: 401 });
  const phone = user.phone;

  const today = todayISO();
  if (parsed.data.items.some((item) => item.date < today || item.date > addDaysISO(today, 60)))
    return NextResponse.json({ error: "تاریخ باید در ۶۰ روز آینده باشد." }, { status: 400 });
  const limitKey = `hold:user:${user.id}`;
  if (!rateLimit(limitKey, 12, 60_000))
    return NextResponse.json({ error: "درخواست‌های بیش از حد؛ یک دقیقه صبر کنید." }, { status: 429 });

  try {
    const result = await db.transaction(async (tx) => {
      const items = parsed.data.items;
      const lockKeys = [...new Set(items.map(({ barberId, date }) => `${barberId}:${date}`))].sort();
      for (const lockKey of lockKeys)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

      const resolved: Array<
        (typeof items)[number] & {
          service: NonNullable<Awaited<ReturnType<typeof resolveService>>>;
        }
      > = [];
      for (const item of items) {
        await tx.update(appointments).set({ status: "CANCELLED_BY_CLIENT" }).where(and(
          eq(appointments.barberId, item.barberId),
          eq(appointments.date, item.date),
          eq(appointments.status, "PENDING"),
          lt(appointments.createdAt, new Date(Date.now() - 10 * 60_000)),
        ));
        const service = await resolveService(item.barberId, item.serviceId);
        if (!service)
          return { ok: false as const, error: "این خدمت برای آرایشگر فعال نیست." };
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

      // The hold protects the exact resources of the planned visit: capability,
      // working windows, blocked time, existing appointments and live holds are
      // re-checked with the same engine that produced the plan.
      const source = createDbPlannerSource({
        serviceIds: resolved.map((item) => item.serviceId),
        excludePhone: phone,
      });
      const validation = await validateVisitItems(
        source,
        resolved.map((item) => ({
          attendeeId: item.attendeeId,
          barberId: item.barberId,
          serviceId: item.serviceId,
          date: item.date,
          startMin: item.startMin,
        })),
      );
      if (!validation.ok) return { ok: false as const, error: validation.error };

      await tx.delete(bookingHolds).where(eq(bookingHolds.clientPhone, phone));
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      const holds = await tx.insert(bookingHolds).values(
        resolved.map((item) => ({
          barberId: item.barberId,
          serviceId: item.serviceId,
          date: item.date,
          startMin: item.startMin,
          clientPhone: phone,
          expiresAt,
        })),
      ).returning({ id: bookingHolds.id });
      return {
        ok: true as const,
        holdIds: holds.map((hold) => hold.id),
        expiresAt: expiresAt.toISOString(),
        holdDurationSec: 600,
      };
    });
    return NextResponse.json(result, { status: result.ok ? 201 : 409, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Booking hold creation failed", error);
    return NextResponse.json({ error: "ثبت موقت زمان انجام نشد. دوباره تلاش کنید." }, { status: 503 });
  }
}
