import { and, avg, count, desc, eq, gte, sql } from "drizzle-orm";
import { todayISO } from "@/lib/time";
import { db } from "@/db";
import {
  appointments,
  barberServices,
  barberSkills,
  barbers,
  classes,
  portfolioItems,
  reviews,
  services,
  skills,
} from "@/db/schema";
import { upcomingSlots } from "@/lib/availability";
import type { BarberCardData } from "@/components/barber-card";
import type { GalleryItem } from "@/lib/gallery";
import type { CourseCardData, WorkshopCardData } from "@/components/course-cards";

type BarberRow = typeof barbers.$inferSelect;

async function serviceSummary(barberId: number) {
  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      price: services.basePrice,
      customPrice: barberServices.customPrice,
    })
    .from(barberServices)
    .innerJoin(services, eq(services.id, barberServices.serviceId))
    .where(and(eq(barberServices.barberId, barberId), eq(services.active, true)));
  const prices = rows.map((r) => r.customPrice ?? r.price);
  return {
    names: rows.map((r) => r.name),
    startPrice: prices.length > 0 ? Math.min(...prices) : null,
    primaryServiceId: rows[0]?.id ?? null,
  };
}

async function ratingSummary(barberId: number) {
  const [row] = await db
    .select({ value: avg(reviews.rating), total: count() })
    .from(reviews)
    .innerJoin(appointments, and(eq(appointments.id, reviews.appointmentId), eq(appointments.status, "COMPLETED")))
    .where(eq(reviews.barberId, barberId));
  return {
    rating: row?.value ? Number(row.value) : null,
    reviewCount: Number(row?.total ?? 0),
  };
}

export async function buildBarberCard(barber: BarberRow, slotCount = 3): Promise<BarberCardData> {
  const [summary, rating] = await Promise.all([serviceSummary(barber.id), ratingSummary(barber.id)]);
  const slots = summary.primaryServiceId ? await upcomingSlots(barber.id, summary.primaryServiceId, slotCount) : [];

  return {
    id: barber.id,
    slug: barber.slug,
    name: barber.name,
    title: barber.title,
    bio: barber.bio,
    experienceYears: barber.experienceYears,
    imageUrl: barber.imageUrl || null,
    rating: rating.rating,
    reviewCount: rating.reviewCount,
    serviceNames: summary.names,
    startPrice: summary.startPrice,
    primaryServiceId: summary.primaryServiceId,
    nextSlots: slots,
  };
}

export async function getBarberCards(limit?: number): Promise<BarberCardData[]> {
  const rows = await db.select().from(barbers).where(eq(barbers.active, true));
  const sliced = typeof limit === "number" ? rows.slice(0, limit) : rows;
  return Promise.all(sliced.map((b) => buildBarberCard(b)));
}

export async function getHomeBarbers(limit = 4) {
  const rows = await db
    .select({
      id: barbers.id,
      slug: barbers.slug,
      name: barbers.name,
      title: barbers.title,
      imageUrl: barbers.imageUrl,
      bio: barbers.bio,
    })
    .from(barbers)
    .where(eq(barbers.active, true))
    .limit(limit);

  return Promise.all(
    rows.map(async (barber) => ({
      ...barber,
      serviceNames: (await serviceSummary(barber.id)).names.slice(0, 4),
    })),
  );
}

export async function getServices() {
  return db.select().from(services).where(eq(services.active, true));
}

export async function getGalleryItems(limit?: number): Promise<GalleryItem[]> {
  const query = db
    .select({
      id: portfolioItems.id,
      title: portfolioItems.title,
      category: portfolioItems.category,
      imageUrl: portfolioItems.imageUrl,
      barberName: barbers.name,
    })
    .from(portfolioItems)
    .innerJoin(barbers, eq(barbers.id, portfolioItems.barberId))
    .orderBy(desc(portfolioItems.id));
  return typeof limit === "number" ? query.limit(limit) : query;
}

export async function getBarberSkills(barberId: number) {
  const rows = await db
    .select({ name: skills.name })
    .from(barberSkills)
    .innerJoin(skills, eq(skills.id, barberSkills.skillId))
    .where(eq(barberSkills.barberId, barberId));
  return rows.map((r) => r.name);
}

export async function getCourseCards(): Promise<CourseCardData[]> {
  const rows = await db
    .select({
      slug: classes.slug,
      title: classes.title,
      description: classes.description,
      level: classes.level,
      price: classes.price,
      startsOn: classes.startsOn,
      sessions: classes.sessions,
      capacity: classes.capacity,
      seatsTaken: classes.seatsTaken,
      outcomes: classes.outcomes,
      instructorName: barbers.name,
      instructorSlug: barbers.slug,
      instructorId: classes.instructorBarberId,
    })
    .from(classes)
    .leftJoin(barbers, eq(barbers.id, classes.instructorBarberId))
    .where(and(eq(classes.status, "OPEN"), gte(classes.startsOn, todayISO())));

  return Promise.all(
    rows.map(async (c) => ({
      slug: c.slug,
      title: c.title,
      description: c.description,
      level: c.level,
      price: c.price,
      startsOn: c.startsOn,
      sessions: c.sessions,
      capacity: c.capacity,
      seatsTaken: c.seatsTaken,
      instructorName: c.instructorName,
      instructorSlug: c.instructorSlug,
      instructorRating: c.instructorId
        ? (await ratingSummary(c.instructorId)).rating
        : null,
      outcomes: c.outcomes.split("\n").filter(Boolean),
    })),
  );
}

export async function getWorkshopCards(): Promise<WorkshopCardData[]> {
  const rows = await db
    .select({
      slug: classes.slug,
      title: classes.title,
      description: classes.description,
      startsOn: classes.startsOn,
      sessions: classes.sessions,
      capacity: classes.capacity,
      seatsTaken: classes.seatsTaken,
      price: classes.price,
      location: classes.location,
      kind: classes.kind,
      instructorName: barbers.name,
    })
    .from(classes)
    .leftJoin(barbers, eq(barbers.id, classes.instructorBarberId))
    .where(and(eq(classes.status, "OPEN"), eq(classes.kind, "MASTERCLASS"), gte(classes.startsOn, todayISO())));

  return rows.map((r) => ({
    ...r,
    imageUrl: "/images/academy.jpg",
  }));
}

export async function getTopReviews(limit = 3) {
  return db.select().from(reviews).orderBy(desc(reviews.createdAt)).limit(limit);
}

export async function getSalonTotals() {
  const [clientRow] = await db
    .select({ total: sql<number>`count(distinct ${appointments.clientPhone})::int` })
    .from(appointments);
  const [doneRow] = await db
    .select({ total: count() })
    .from(appointments)
    .where(eq(appointments.status, "COMPLETED"));
  return {
    clients: clientRow?.total ?? 0,
    completed: Number(doneRow?.total ?? 0),
  };
}
