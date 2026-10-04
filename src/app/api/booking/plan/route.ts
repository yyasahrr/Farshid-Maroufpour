/**
 * POST /api/booking/plan — public scheduling preview for a multi-service visit.
 *
 * This is the endpoint that makes the customer's mental model true:
 * they pick services + ONE start time, and the server answers with the whole
 * continuous visit (segments, staff assignments, server-computed price) or the
 * set of start times the entire combination can actually fit into.
 *
 * It is a preview only — final validation re-runs inside the booking
 * transaction. Responses carry only public schedule shape, never client data.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";
import { loadPlannerData } from "@/lib/visit-planner-data";
import { planVisit } from "@/lib/visit-planner";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";

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

export const PlanRequestBody = z.object({
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر است"),
  startMin: z.number().int().min(0).max(1439).nullish(),
  attendees: z.array(AttendeeSchema).min(1).max(12),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = PlanRequestBody.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "اطلاعات انتخاب نامعتبر است." }, { status: 400 });

  const today = todayISO();
  const { date, attendees } = parsed.data;
  if (date < today || date > addDaysISO(today, 60))
    return NextResponse.json({ error: "تاریخ باید در ۶۰ روز آینده باشد." }, { status: 400 });

  const uniqueIds = [...new Set(attendees.map((a) => a.attendeeId))];
  if (uniqueIds.length !== attendees.length)
    return NextResponse.json({ error: "شرکت‌کننده تکراری است." }, { status: 400 });

  if (!rateLimit(`plan:${date}`, 240, 60_000))
    return NextResponse.json({ error: "درخواست‌های بیش از حد؛ یک دقیقه صبر کنید." }, { status: 429 });

  try {
    const data = await loadPlannerData(date, attendees);
    const outcome = planVisit(
      { date, startMin: parsed.data.startMin ?? null, attendees },
      data,
    );
    return NextResponse.json(
      {
        plan: outcome.plan,
        validStarts: outcome.validStarts,
        nearby: outcome.nearby,
        issues: outcome.issues,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Visit plan failed", error);
    return NextResponse.json({ error: "زمان‌بندی در حال حاضر قابل بررسی نیست. کمی بعد تلاش کنید." }, { status: 503 });
  }
}
