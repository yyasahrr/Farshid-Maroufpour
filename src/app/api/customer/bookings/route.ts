import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, barbers, classes, classRegistrations, services } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { todayISO } from "@/lib/time";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "کاربر وارد نشده است." }, { status: 401 });
  }

  const today = todayISO();

  // 1. Fetch appointments for user's phone
  const userAppts = await db
    .select({
      id: appointments.id,
      bookingGroupId: appointments.bookingGroupId,
      clientName: appointments.clientName,
      date: appointments.date,
      startMin: appointments.startMin,
      endMin: appointments.endMin,
      priceSnapshot: appointments.priceSnapshot,
      status: appointments.status,
      notes: appointments.notes,
      source: appointments.source,
      createdAt: appointments.createdAt,
      barberName: barbers.name,
      barberTitle: barbers.title,
      barberSlug: barbers.slug,
      serviceName: services.name,
      serviceDuration: services.durationMin,
    })
    .from(appointments)
    .innerJoin(barbers, eq(barbers.id, appointments.barberId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(eq(appointments.clientPhone, user.phone))
    .orderBy(desc(appointments.date), desc(appointments.startMin));

  // 2. Separate into upcoming, past, cancelled
  const upcoming = userAppts.filter(
    (a) => !a.status.startsWith("CANCELLED") && a.status !== "COMPLETED" && a.date >= today,
  );
  const past = userAppts.filter(
    (a) => (a.status === "COMPLETED" || a.date < today) && !a.status.startsWith("CANCELLED"),
  );
  const cancelled = userAppts.filter((a) => a.status.startsWith("CANCELLED"));

  // 3. User's enrolled classes
  const enrolledClasses = await db
    .select({
      id: classRegistrations.id,
      title: classes.title,
      slug: classes.slug,
      level: classes.level,
      price: classes.price,
      startsOn: classes.startsOn,
      sessions: classes.sessions,
      location: classes.location,
      status: classRegistrations.status,
    })
    .from(classRegistrations)
    .innerJoin(classes, eq(classes.id, classRegistrations.classId))
    .where(eq(classRegistrations.studentPhone, user.phone))
    .orderBy(desc(classes.startsOn));

  return NextResponse.json({
    user,
    upcoming,
    past,
    cancelled,
    classes: enrolledClasses,
  });
}
