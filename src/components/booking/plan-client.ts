"use client";

import { z } from "zod";

/**
 * Client access to the visit planner.
 *
 * Two endpoints, both server-computed: the smart calendar (which days can host
 * the complete visit) and the plan list for one day. Identical requests are
 * de-duplicated and cached in memory for the session, so moving back and forth
 * between steps never re-hits the API for an answer the server already gave.
 */

export type VisitPreference = "EARLIEST" | "ONE_BARBER" | "PREFERRED_BARBER";

const planStepSchema = z.object({
  serviceId: z.number(),
  serviceName: z.string(),
  barberId: z.number(),
  barberName: z.string(),
  startMin: z.number(),
  endMin: z.number(),
  processingMin: z.number().optional().default(0),
  waitMin: z.number().optional().default(0),
});

const planStartSchema = z.object({
  startMin: z.number(),
  endMin: z.number(),
  badges: z.array(z.string()),
  steps: z.array(planStepSchema),
});

const optionSchema = z.object({
  key: z.string(),
  barberNames: z.array(z.string()),
  oneBarber: z.boolean(),
  handoffs: z.number(),
  durationMin: z.number(),
  price: z.number(),
  amountDueOnline: z.number(),
  remainingDue: z.number(),
  paymentMode: z.enum(["NO_PAYMENT", "DEPOSIT", "FULL_PAYMENT"]),
  badges: z.array(z.string()),
  includesPreferredBarber: z.boolean(),
  starts: z.array(planStartSchema),
});

const planResponseSchema = z.object({
  date: z.string(),
  options: z.array(optionSchema),
  explanation: z.object({ reason: z.string(), message: z.string() }).nullable(),
  demoPhoneHint: z.string().nullable().optional(),
  error: z.string().optional(),
});

const calendarDaySchema = z.object({
  date: z.string(),
  planCount: z.number(),
  planCountCapped: z.boolean(),
  optionCount: z.number(),
  startCount: z.number(),
  firstStartMin: z.number().nullable(),
  firstEndMin: z.number().nullable(),
  oneBarberAvailable: z.boolean(),
  barberNames: z.array(z.string()),
});

const calendarResponseSchema = z.object({
  from: z.string(),
  days: z.number(),
  window: z.array(calendarDaySchema),
  nearest: calendarDaySchema.nullable(),
  today: z.string(),
  error: z.string().optional(),
});

export type VisitPlanOption = z.infer<typeof optionSchema>;
export type VisitPlanStart = z.infer<typeof planStartSchema>;
export type VisitPlanStep = z.infer<typeof planStepSchema>;
export type CalendarDay = z.infer<typeof calendarDaySchema>;
export type PlanResponse = z.infer<typeof planResponseSchema>;

export type PlanQuery = {
  serviceIds: number[];
  date: string;
  preference: VisitPreference;
  preferredBarberId?: number | null;
  onlyPreferredBarber?: boolean;
};

export type CalendarQuery = {
  serviceIds: number[];
  preference: VisitPreference;
  preferredBarberId?: number | null;
  onlyPreferredBarber?: boolean;
  from: string;
  days: number;
};

const planCache = new Map<string, PlanResponse>();
const planInflight = new Map<string, Promise<PlanResponse>>();
const calendarCache = new Map<string, z.infer<typeof calendarResponseSchema>>();
const calendarInflight = new Map<string, Promise<z.infer<typeof calendarResponseSchema>>>();

function planKey(query: PlanQuery): string {
  return [
    query.serviceIds.join(","),
    query.date,
    query.preference,
    query.preferredBarberId ?? "-",
    query.onlyPreferredBarber ? "strict" : "-",
  ].join("|");
}

function calendarKey(query: CalendarQuery): string {
  return [
    query.serviceIds.join(","),
    query.preference,
    query.preferredBarberId ?? "-",
    query.onlyPreferredBarber ? "strict" : "-",
    query.from,
    query.days,
  ].join("|");
}

/** Drops cached answers after a booking changed availability. */
export function invalidatePlanCache() {
  planCache.clear();
  calendarCache.clear();
}

export async function fetchPlans(query: PlanQuery): Promise<PlanResponse> {
  const key = planKey(query);
  const cached = planCache.get(key);
  if (cached) return cached;
  const inflight = planInflight.get(key);
  if (inflight) return inflight;

  const request = (async () => {
    const response = await fetch("/api/booking/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serviceIds: query.serviceIds,
        date: query.date,
        preference: query.preference,
        preferredBarberId: query.preferredBarberId ?? null,
        onlyPreferredBarber: Boolean(query.onlyPreferredBarber),
      }),
      cache: "no-store",
    });
    const json: unknown = await response.json().catch(() => null);
    const parsed = planResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error("پاسخ زمان‌بندی معتبر نیست؛ دوباره تلاش کنید.");
    if (!response.ok) throw new Error(parsed.data.error ?? "دریافت زمان‌ها ممکن نشد.");
    planCache.set(key, parsed.data);
    return parsed.data;
  })().finally(() => {
    planInflight.delete(key);
  });

  planInflight.set(key, request);
  return request;
}

export async function fetchCalendar(query: CalendarQuery) {
  const key = calendarKey(query);
  const cached = calendarCache.get(key);
  if (cached) return cached;
  const inflight = calendarInflight.get(key);
  if (inflight) return inflight;

  const params = new URLSearchParams({
    services: query.serviceIds.join(","),
    preference: query.preference,
    from: query.from,
    days: String(query.days),
  });
  if (query.preferredBarberId) params.set("barber", String(query.preferredBarberId));
  if (query.onlyPreferredBarber) params.set("onlyBarber", "1");

  const request = (async () => {
    const response = await fetch(`/api/booking/calendar?${params.toString()}`, { cache: "no-store" });
    const json: unknown = await response.json().catch(() => null);
    const parsed = calendarResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error("پاسخ تقویم معتبر نیست؛ دوباره تلاش کنید.");
    if (!response.ok) throw new Error(parsed.data.error ?? "دریافت تقویم ممکن نشد.");
    calendarCache.set(key, parsed.data);
    return parsed.data;
  })().finally(() => {
    calendarInflight.delete(key);
  });

  calendarInflight.set(key, request);
  return request;
}
