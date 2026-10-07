import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { appointments, barbers, classes, classRegistrations, payments, services } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { CustomerPanelClient, type CustomerVisit } from "@/components/customer/CustomerPanelClient";
import { StaffAccountSection } from "@/components/customer/StaffAccountSection";
import { CustomerLoginPrompt } from "@/components/customer/CustomerLoginPrompt";
import { buildVisitGroups, visitStatus } from "@/lib/visits";
import { todayISO } from "@/lib/time";
import { demoPhoneHint } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "پنل من" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user)
    return (
      <div className="ui-shell ui-container flex min-h-[70svh] items-center justify-center py-10">
        <CustomerLoginPrompt demoPhoneHint={demoPhoneHint()} />
      </div>
    );

  const today = todayISO();
  const [appointmentRows, registrationRows] = await Promise.all([
    db
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
        serviceId: services.id,
        serviceName: services.name,
        barberId: barbers.id,
        barberName: barbers.name,
        barberSlug: barbers.slug,
      })
      .from(appointments)
      .innerJoin(barbers, eq(appointments.barberId, barbers.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .where(eq(appointments.clientPhone, user.phone))
      .orderBy(desc(appointments.date), desc(appointments.startMin)),
    db
      .select({
        id: classRegistrations.id,
        title: classes.title,
        slug: classes.slug,
        startsOn: classes.startsOn,
        location: classes.location,
        status: classRegistrations.status,
      })
      .from(classRegistrations)
      .innerJoin(classes, eq(classRegistrations.classId, classes.id))
      .where(eq(classRegistrations.studentPhone, user.phone))
      .orderBy(desc(classes.startsOn)),
  ]);

  // Payments are attached to the visit, not to one of its segments.
  const groupFirstIds = new Map<string, number>();
  for (const appointment of appointmentRows) {
    if (!appointment.bookingGroupId) continue;
    const current = groupFirstIds.get(appointment.bookingGroupId);
    if (current === undefined || appointment.id < current)
      groupFirstIds.set(appointment.bookingGroupId, appointment.id);
  }
  const [appointmentPayments, classPayments] = await Promise.all([
    appointmentRows.length
      ? db
          .select({ kind: payments.kind, refId: payments.refId, reference: payments.reference, status: payments.status })
          .from(payments)
          .where(
            or(
              and(eq(payments.kind, "APPOINTMENT"), inArray(payments.refId, appointmentRows.map((a) => a.id))),
              and(eq(payments.kind, "APPOINTMENT_GROUP"), inArray(payments.refId, [...groupFirstIds.values()].length ? [...groupFirstIds.values()] : [-1])),
            ),
          )
      : Promise.resolve([]),
    registrationRows.length
      ? db
          .select({ refId: payments.refId, reference: payments.reference, status: payments.status })
          .from(payments)
          .where(and(eq(payments.kind, "CLASS"), inArray(payments.refId, registrationRows.map((a) => a.id))))
      : Promise.resolve([]),
  ]);

  const visits: CustomerVisit[] = buildVisitGroups(appointmentRows).map((visit) => {
    const groupFirstId = visit.bookingGroupId ? groupFirstIds.get(visit.bookingGroupId) : undefined;
    const payment =
      (groupFirstId === undefined
        ? undefined
        : appointmentPayments.find((item) => item.kind === "APPOINTMENT_GROUP" && item.refId === groupFirstId)) ??
      appointmentPayments.find(
        (item) => item.kind === "APPOINTMENT" && visit.segments.some((segment) => segment.id === item.refId),
      );
    return {
      key: visit.key,
      bookingGroupId: visit.bookingGroupId,
      date: visit.date,
      startMin: visit.startMin,
      endMin: visit.endMin,
      status: visitStatus(visit),
      barberNames: visit.barberNames,
      barberSlug: visit.segments[0].barberSlug ?? "",
      oneBarber: visit.oneBarber,
      price: visit.price,
      notes: visit.segments.map((segment) => segment.notes).find(Boolean) ?? "",
      segments: visit.segments.map((segment) => ({
        id: segment.id,
        serviceName: segment.serviceName,
        barberName: segment.barberName,
        startMin: segment.startMin,
        endMin: segment.endMin,
      })),
      paymentReference: payment?.reference ?? null,
      paymentStatus: payment?.status ?? null,
    };
  });

  const upcoming = visits
    .filter(
      (visit) =>
        visit.date >= today &&
        !visit.status.startsWith("CANCELLED") &&
        visit.status !== "COMPLETED" &&
        visit.status !== "NO_SHOW",
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const past = visits.filter(
    (visit) =>
      !visit.status.startsWith("CANCELLED") &&
      (visit.date < today || visit.status === "COMPLETED" || visit.status === "NO_SHOW"),
  );
  const cancelled = visits.filter((visit) => visit.status.startsWith("CANCELLED"));

  const classesList = registrationRows.map((row) => ({
    ...row,
    paymentReference: classPayments.find((payment) => payment.refId === row.id)?.reference ?? null,
    paymentStatus: classPayments.find((payment) => payment.refId === row.id)?.status ?? null,
  }));

  return (
    <div className="ui-shell ui-container ui-page">
      {user.roles.some((role) => !["CLIENT", "TRAINEE"].includes(role)) && (
        <StaffAccountSection user={user} canViewTeam={user.permissions.has("staff:view") || user.permissions.has("roles:manage")} />
      )}
      <CustomerPanelClient
        user={{ id: user.id, name: user.name, phone: user.phone, role: user.role }}
        upcoming={upcoming}
        past={past}
        cancelled={cancelled}
        enrolledClasses={classesList}
      />
    </div>
  );
}
