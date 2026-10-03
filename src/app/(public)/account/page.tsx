import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { appointments, barbers, classes, classRegistrations, payments, services } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { CustomerPanelClient } from "@/components/customer/CustomerPanelClient";
import { CustomerLoginPrompt } from "@/components/customer/CustomerLoginPrompt";
import { todayISO } from "@/lib/time";
import { demoPhoneHint } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "پنل من" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="ui-shell ui-container flex min-h-[70svh] items-center justify-center py-10"><CustomerLoginPrompt demoPhoneHint={demoPhoneHint()} /></div>;
  const today = todayISO();
  const [appointmentRows, registrationRows] = await Promise.all([
    db.select({ id: appointments.id, bookingGroupId: appointments.bookingGroupId, clientName: appointments.clientName, date: appointments.date, startMin: appointments.startMin, endMin: appointments.endMin, priceSnapshot: appointments.priceSnapshot, status: appointments.status, notes: appointments.notes, barberName: barbers.name, barberSlug: barbers.slug, serviceName: services.name, serviceId: services.id })
      .from(appointments).innerJoin(barbers, eq(appointments.barberId, barbers.id)).innerJoin(services, eq(appointments.serviceId, services.id))
      .where(eq(appointments.clientPhone, user.phone)).orderBy(desc(appointments.date), desc(appointments.startMin)),
    db.select({ id: classRegistrations.id, title: classes.title, slug: classes.slug, startsOn: classes.startsOn, location: classes.location, status: classRegistrations.status })
      .from(classRegistrations).innerJoin(classes, eq(classRegistrations.classId, classes.id))
      .where(eq(classRegistrations.studentPhone, user.phone)).orderBy(desc(classes.startsOn)),
  ]);
  const groupFirstIds = new Map<string, number>();
  for (const appointment of appointmentRows) {
    if (!appointment.bookingGroupId) continue;
    const current = groupFirstIds.get(appointment.bookingGroupId);
    if (current === undefined || appointment.id < current)
      groupFirstIds.set(appointment.bookingGroupId, appointment.id);
  }
  const [appointmentPayments, classPayments] = await Promise.all([
    appointmentRows.length ? db.select({ kind: payments.kind, refId: payments.refId, reference: payments.reference, status: payments.status }).from(payments).where(or(
      and(eq(payments.kind, "APPOINTMENT"), inArray(payments.refId, appointmentRows.map((a) => a.id))),
      and(eq(payments.kind, "APPOINTMENT_GROUP"), inArray(payments.refId, [...groupFirstIds.values()])),
    )) : Promise.resolve([]),
    registrationRows.length ? db.select({ refId: payments.refId, reference: payments.reference, status: payments.status }).from(payments).where(and(eq(payments.kind, "CLASS"), inArray(payments.refId, registrationRows.map((a) => a.id)))) : Promise.resolve([]),
  ]);
  const bookings = appointmentRows.map((row) => {
    const individualPayment = appointmentPayments.find((payment) => payment.kind === "APPOINTMENT" && payment.refId === row.id);
    const groupFirstId = row.bookingGroupId ? groupFirstIds.get(row.bookingGroupId) : undefined;
    const groupPayment = groupFirstId === undefined ? undefined : appointmentPayments.find((payment) => payment.kind === "APPOINTMENT_GROUP" && payment.refId === groupFirstId);
    const payment = individualPayment ?? groupPayment;
    return { ...row, paymentReference: payment?.reference ?? null, paymentStatus: payment?.status ?? null };
  });
  const upcoming = bookings.filter((a) => a.date >= today && !a.status.startsWith("CANCELLED") && a.status !== "COMPLETED" && a.status !== "NO_SHOW")
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const past = bookings.filter((a) => !a.status.startsWith("CANCELLED") && (a.date < today || a.status === "COMPLETED" || a.status === "NO_SHOW"));
  const cancelled = bookings.filter((a) => a.status.startsWith("CANCELLED"));
  const classesList = registrationRows.map((row) => ({ ...row, paymentReference: classPayments.find((p) => p.refId === row.id)?.reference ?? null, paymentStatus: classPayments.find((p) => p.refId === row.id)?.status ?? null }));
  return <div className="ui-shell ui-container ui-page"><CustomerPanelClient user={{ id: user.id, name: user.name, phone: user.phone, role: user.role }} upcoming={upcoming} past={past} cancelled={cancelled} enrolledClasses={classesList} /></div>;
}
