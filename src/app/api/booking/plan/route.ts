import { NextResponse } from "next/server";
import { z } from "zod";
import { createDbPlannerSource } from "@/lib/visit-planner-db";
import { planVisitDay, type VisitPreference } from "@/lib/visit-planner";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";
import { demoPhoneHint } from "@/lib/preview";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";
import { getCurrentUser } from "@/lib/session";

/**
 * Booking plans for one date — the smart calendar's detail endpoint.
 *
 * Public by design: a customer must be able to see what is actually possible
 * before being asked to authenticate. Nothing here creates or reserves anything;
 * the hold and the final transaction revalidate every segment server-side.
 */

const PlanRequestSchema = z.object({
  serviceIds: z.array(z.coerce.number().int().positive()).min(1).max(8),
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر است"),
  preference: z.enum(["EARLIEST", "ONE_BARBER", "PREFERRED_BARBER"]).default("EARLIEST"),
  preferredBarberId: z.coerce.number().int().positive().nullable().optional(),
  onlyPreferredBarber: z.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(6).optional(),
  startsPerOption: z.coerce.number().int().min(1).max(8).optional(),
});

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  if (!rateLimit(`plan:${clientKey(request)}`, 120, 60_000))
    return NextResponse.json({ error: "درخواست‌های بیش از حد؛ چند لحظه صبر کنید." }, { status: 429 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "اطلاعات درخواست نامعتبر است." }, { status: 400 });

  const today = todayISO();
  const { date, serviceIds, preference, preferredBarberId, onlyPreferredBarber, limit, startsPerOption } = parsed.data;
  if (date < today || date > addDaysISO(today, 60))
    return NextResponse.json({ error: "تاریخ باید بین امروز و ۶۰ روز آینده باشد." }, { status: 400 });

  try {
    const user = await getCurrentUser();
    const source = createDbPlannerSource({ serviceIds, excludePhone: user?.phone });
    const result = await planVisitDay(source, {
      date,
      serviceIds,
      preference: preference as VisitPreference,
      preferredBarberId: preferredBarberId ?? null,
      onlyPreferredBarber,
      limit: limit ?? 4,
    });

    // The response is deliberately narrow: start/end, team, duration, price and
    // a couple of meaningful badges. No planner internals, no customer data.
    const options = result.options.map((option) => ({
      key: option.key,
      barberNames: option.barberNames,
      oneBarber: option.oneBarber,
      handoffs: option.handoffs,
      durationMin: option.durationMin,
      price: option.price,
      amountDueOnline: option.amountDueOnline,
      remainingDue: option.remainingDue,
      paymentMode: option.paymentMode,
      badges: option.badges,
      includesPreferredBarber: option.includesPreferredBarber,
      starts: option.starts.slice(0, startsPerOption ?? 4).map((start) => ({
        startMin: start.startMin,
        endMin: start.endMin,
        badges: start.plan.badges,
        steps: start.plan.steps.map((step) => ({
          serviceId: step.serviceId,
          serviceName: step.serviceName,
          barberId: step.barberId,
          barberName: step.barberName,
          startMin: step.startMin,
          endMin: step.endMin,
          // Processing time is part of the service, never a random gap: showing
          // it keeps a "90 minute colour" from looking like a scheduling error.
          processingMin: step.processingMin,
          waitMin: step.waitMin,
        })),
      })),
    }));

    return NextResponse.json(
      {
        date,
        options,
        explanation: result.explanation,
        demoPhoneHint: demoPhoneHint() ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Visit planning failed", error);
    return NextResponse.json(
      { error: "محاسبهٔ زمان‌های آزاد ممکن نشد؛ دوباره تلاش کنید." },
      { status: 503 },
    );
  }
}
