import { NextResponse } from "next/server";
import { and, avg, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  appointments,
  barberServices,
  barberSkills,
  barbers,
  reviews,
  services,
  skills,
} from "@/db/schema";
import {
  buildSlots,
  getDayContext,
  resolveService,
} from "@/lib/availability";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";

const QuerySchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  date: z.string().refine(isValidISODate),
  time: z.coerce.number().int().min(0).max(1439).optional(),
  barberId: z.coerce.number().int().positive().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "پارامترهای نامعتبر است." }, { status: 400 });
  }

  const { serviceId, date, time, barberId } = parsed.data;
  const today = todayISO();
  if (date < today || date > addDaysISO(today, 60)) {
    return NextResponse.json({ error: "تاریخ باید در ۶۰ روز آینده باشد." }, { status: 400 });
  }

  // 1. Get base service
  const [baseService] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.active, true)))
    .limit(1);

  if (!baseService) {
    return NextResponse.json({ error: "سرویس مورد نظر یافت نشد یا غیرفعال است." }, { status: 404 });
  }

  // 2. Find eligible barbers
  // Barbers must offer the service via barberServices
  const serviceLinks = await db
    .select({ barberId: barberServices.barberId })
    .from(barberServices)
    .where(eq(barberServices.serviceId, serviceId));

  let candidateBarberIds = serviceLinks.map((l) => l.barberId);
  if (candidateBarberIds.length === 0) {
    return NextResponse.json({
      service: baseService,
      barbers: [],
      exactAvailableCount: 0,
      recoverySlots: [],
    });
  }

  // Check required skill eligibility if specified
  if (baseService.requiredSkillId) {
    const skillHolders = await db
      .select({ barberId: barberSkills.barberId })
      .from(barberSkills)
      .where(
        and(
          eq(barberSkills.skillId, baseService.requiredSkillId),
          inArray(barberSkills.barberId, candidateBarberIds),
        ),
      );
    candidateBarberIds = skillHolders.map((s) => s.barberId);
  }

  if (candidateBarberIds.length === 0) {
    return NextResponse.json({
      service: baseService,
      barbers: [],
      exactAvailableCount: 0,
      recoverySlots: [],
    });
  }

  // Filter by requested barber if specified
  if (barberId) {
    if (!candidateBarberIds.includes(barberId)) {
      return NextResponse.json({
        service: baseService,
        barbers: [],
        exactAvailableCount: 0,
        recoverySlots: [],
      });
    }
    candidateBarberIds = [barberId];
  }

  // Fetch barbers info
  const barberRows = await db
    .select()
    .from(barbers)
    .where(and(inArray(barbers.id, candidateBarberIds), eq(barbers.active, true)));

  // Fetch reviews / ratings
  const reviewStats = await db
    .select({
      barberId: reviews.barberId,
      avgRating: avg(reviews.rating),
      reviewCount: count(),
    })
    .from(reviews)
    .innerJoin(appointments, and(eq(appointments.id, reviews.appointmentId), eq(appointments.status, "COMPLETED")))
    .where(inArray(reviews.barberId, candidateBarberIds))
    .groupBy(reviews.barberId);

  // Fetch skill names
  const skillRows = await db
    .select({
      barberId: barberSkills.barberId,
      skillName: skills.name,
    })
    .from(barberSkills)
    .innerJoin(skills, eq(skills.id, barberSkills.skillId))
    .where(inArray(barberSkills.barberId, candidateBarberIds));

  // Compute availability for each barber on this date
  type EvaluatedBarber = {
    id: number;
    name: string;
    slug: string;
    title: string;
    bio: string;
    experienceYears: number;
    specialization: string;
    rating: number | null;
    reviewCount: number;
    resolvedPrice: number;
    durationMin: number;
    barberDurationMin: number;
    bufferMin: number;
    isExactAvailable: boolean;
    exactSlot: { startMin: number; endMin: number } | null;
    nearbySlots: { startMin: number; endMin: number }[];
    allAvailableSlots: { startMin: number; endMin: number }[];
  };

  const evaluatedBarbers: EvaluatedBarber[] = [];
  const allFreeSlotsMap = new Map<number, number>(); // startMin -> count of barbers

  for (const b of barberRows) {
    const resolved = await resolveService(b.id, serviceId);
    if (!resolved) continue;

    const ctx = await getDayContext(b.id, date);
    const daySlots = buildSlots(ctx, resolved.barberDurationMin, resolved.bufferMin, date);
    const freeSlots = daySlots.filter((s) => s.state === "AVAILABLE");

    freeSlots.forEach((s) => {
      allFreeSlotsMap.set(s.startMin, (allFreeSlotsMap.get(s.startMin) ?? 0) + 1);
    });

    const stat = reviewStats.find((s) => s.barberId === b.id);
    const bSkills = skillRows.filter((s) => s.barberId === b.id).map((s) => s.skillName);

    let isExactAvailable = false;
    let exactSlot: { startMin: number; endMin: number } | null = null;
    let nearbySlots: { startMin: number; endMin: number }[] = [];

    if (time !== undefined) {
      const hit = freeSlots.find((s) => s.startMin === time);
      if (hit) {
        isExactAvailable = true;
        exactSlot = { startMin: hit.startMin, endMin: hit.endMin };
      } else {
        // Find nearest 2 available slots to `time`
        nearbySlots = freeSlots
          .map((s) => ({ ...s, dist: Math.abs(s.startMin - time) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 2)
          .map((s) => ({ startMin: s.startMin, endMin: s.endMin }));
      }
    }

    evaluatedBarbers.push({
      id: b.id,
      name: b.name,
      slug: b.slug,
      title: b.title,
      bio: b.bio,
      experienceYears: b.experienceYears,
      specialization: bSkills.slice(0, 3).join(" · ") || b.title,
      rating: stat?.avgRating ? Number(stat.avgRating) : null,
      reviewCount: Number(stat?.reviewCount ?? 0),
      resolvedPrice: resolved.price,
      durationMin: resolved.durationMin,
      barberDurationMin: resolved.barberDurationMin,
      bufferMin: resolved.bufferMin,
      isExactAvailable,
      exactSlot,
      nearbySlots,
      allAvailableSlots: freeSlots.map((s) => ({ startMin: s.startMin, endMin: s.endMin })),
    });
  }

  // Exact available count
  const exactAvailableCount = evaluatedBarbers.filter((b) => b.isExactAvailable).length;

  // Recovery slots if exact time is not available
  let recoverySlots: { startMin: number; barberCount: number }[] = [];
  if (time !== undefined && exactAvailableCount === 0) {
    recoverySlots = Array.from(allFreeSlotsMap.entries())
      .map(([startMin, count]) => ({ startMin, barberCount: count, dist: Math.abs(startMin - time) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 4)
      .map(({ startMin, barberCount }) => ({ startMin, barberCount }));
  }

  // Sort evaluated barbers: exact available first, then highest rating / experience
  evaluatedBarbers.sort((a, b) => {
    if (a.isExactAvailable && !b.isExactAvailable) return -1;
    if (!a.isExactAvailable && b.isExactAvailable) return 1;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });

  return NextResponse.json({
    service: {
      id: baseService.id,
      name: baseService.name,
      slug: baseService.slug,
      description: baseService.description,
      durationMin: baseService.durationMin,
      basePrice: baseService.basePrice,
      paymentMode: baseService.paymentMode,
      depositAmount: baseService.depositAmount,
    },
    barbers: evaluatedBarbers,
    exactAvailableCount,
    recoverySlots,
  }, { headers: { "Cache-Control": "no-store" } });
}
