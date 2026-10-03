import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { barbers } from "@/db/schema";
import {
  anyBarberSuggestion,
  getAvailability,
  nextAvailable,
} from "@/lib/availability";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";

const Query = z.object({
  barberId: z.coerce.number().int().positive().max(2147483647).optional(),
  serviceId: z.coerce.number().int().positive().max(2147483647),
  date: z.string().refine(isValidISODate),
});

export async function GET(request: Request) {
  const parsed = Query.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "پارامترهای نامعتبر" }, { status: 400 });
  const { barberId, serviceId, date } = parsed.data;
  const today = todayISO();
  if (date < today || date > addDaysISO(today, 60))
    return NextResponse.json(
      { error: "تاریخ باید در ۶۰ روز آینده باشد." },
      { status: 400 },
    );
  try {
    if (!barberId) {
      const suggestion = await anyBarberSuggestion(serviceId, date);
      return NextResponse.json(
        { mode: "ANY", suggestion },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const [barber] = await db
      .select({ id: barbers.id })
      .from(barbers)
      .where(and(eq(barbers.id, barberId), eq(barbers.active, true)))
      .limit(1);
    if (!barber)
      return NextResponse.json(
        { error: "آرایشگر در دسترس نیست." },
        { status: 404 },
      );
    const { service, slots } = await getAvailability(barberId, serviceId, date);
    if (!service)
      return NextResponse.json(
        { error: "سرویس برای این آرایشگر فعال نیست." },
        { status: 404 },
      );
    const next = slots.some((s) => s.state === "AVAILABLE")
      ? null
      : await nextAvailable(barberId, serviceId, date);
    // The public contract intentionally excludes appointment identifiers and client details.
    return NextResponse.json(
      {
        mode: "BARBER",
        service: {
          id: service.id,
          name: service.name,
          price: service.price,
          durationMin: service.durationMin,
          barberDurationMin: service.barberDurationMin,
          paymentMode: service.paymentMode,
          depositAmount: service.depositAmount,
          amountDueOnline: service.amountDueOnline,
          remainingDue: service.remainingDue,
        },
        slots: slots.map(({ startMin, endMin, state, label }) => ({
          startMin,
          endMin,
          state,
          label,
        })),
        next,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "دریافت زمان‌ها ممکن نشد؛ دوباره تلاش کنید." },
      { status: 503 },
    );
  }
}
