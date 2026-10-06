import { NextResponse } from "next/server";
import { z } from "zod";
import { createDbPlannerSource } from "@/lib/visit-planner-db";
import { nearestOpenDay, planCalendar, type VisitPreference } from "@/lib/visit-planner";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Smart calendar: which days can host the COMPLETE visit.
 *
 * A day is enabled only when at least one valid plan exists on it, so the
 * calendar never advertises a day the booking itself would reject. The scan is
 * bounded (max three weeks) and computed on the server; the browser never
 * derives availability.
 */

const QuerySchema = z.object({
  services: z.string().regex(/^\d+(,\d+)*$/, "خدمت نامعتبر است"),
  preference: z.enum(["EARLIEST", "ONE_BARBER", "PREFERRED_BARBER"]).default("EARLIEST"),
  barber: z.coerce.number().int().positive().optional(),
  onlyBarber: z.enum(["0", "1"]).optional(),
  from: z.string().refine(isValidISODate).optional(),
  days: z.coerce.number().int().min(1).max(21).optional(),
});

export async function GET(request: Request) {
  if (!rateLimit(`calendar:${request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local"}`, 90, 60_000))
    return NextResponse.json({ error: "درخواست‌های بیش از حد؛ چند لحظه صبر کنید." }, { status: 429 });

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success)
    return NextResponse.json({ error: "پارامترهای نامعتبر است." }, { status: 400 });

  const serviceIds = [...new Set(parsed.data.services.split(",").map(Number))].slice(0, 8);
  const today = todayISO();
  const from = parsed.data.from && parsed.data.from >= today ? parsed.data.from : today;
  const days = parsed.data.days ?? 14;
  if (from > addDaysISO(today, 60))
    return NextResponse.json({ error: "بازهٔ تاریخ نامعتبر است." }, { status: 400 });

  try {
    const source = createDbPlannerSource({ serviceIds });
    const window = await planCalendar(source, {
      serviceIds,
      preference: parsed.data.preference as VisitPreference,
      preferredBarberId: parsed.data.barber ?? null,
      onlyPreferredBarber: parsed.data.onlyBarber === "1",
      from,
      days,
    });
    const nearest = nearestOpenDay(window);
    return NextResponse.json(
      { from, days, window, nearest, today },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Calendar planning failed", error);
    return NextResponse.json({ error: "دریافت تقویم ممکن نشد؛ دوباره تلاش کنید." }, { status: 503 });
  }
}
