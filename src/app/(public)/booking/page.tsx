import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { barberServices, barberSkills, barbers, services } from "@/db/schema";
import { CustomerBooking } from "@/components/booking/CustomerBooking";
import type { BookingBarberItem, BookingServiceItem, VisitPreference } from "@/components/booking/types";
import { getCurrentUser } from "@/lib/session";
import { POLICY_CURRENT_VERSION } from "@/lib/auth-otp";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";
import { demoPhoneHint } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "رزرو آنلاین خدمات | آکادمی زیبایی فرشید معروف پور" };

export async function loadBookingData() {
  const [serviceRows, barberRows, links, skillRows] = await Promise.all([
    db.select().from(services).where(eq(services.active, true)),
    db.select().from(barbers).where(eq(barbers.active, true)),
    db.select().from(barberServices),
    db.select().from(barberSkills),
  ]);

  // Capability uses the exact rule the server enforces during booking: an
  // approved skill for the service (when the service requires one) plus an
  // explicit barber↔service link.
  const capableServiceIds = (barberId: number) =>
    links
      .filter((link) => link.barberId === barberId)
      .filter((link) => {
        const service = serviceRows.find((row) => row.id === link.serviceId);
        if (!service) return false;
        if (!service.requiredSkillId) return true;
        return skillRows.some(
          (skill) => skill.barberId === barberId && skill.skillId === service.requiredSkillId && skill.status === "APPROVED",
        );
      })
      .map((link) => link.serviceId);

  const barbersList: BookingBarberItem[] = barberRows.map((barber) => ({
    id: barber.id,
    slug: barber.slug,
    name: barber.name,
    title: barber.title,
    serviceIds: capableServiceIds(barber.id),
  }));

  const servicesList: BookingServiceItem[] = serviceRows.map((service) => ({
    id: service.id,
    slug: service.slug,
    name: service.name,
    category: service.category || "اصلاح",
    durationMin: service.durationMin,
    basePrice: service.basePrice,
    description: service.description,
    paymentMode: service.paymentMode as "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT",
    depositAmount: service.depositAmount,
  }));

  return { servicesList, barbersList };
}

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{
    barber?: string;
    service?: string;
    services?: string;
    pref?: string;
    only?: string;
    date?: string;
    time?: string;
  }>;
}) {
  const sp = await searchParams;
  const [{ servicesList, barbersList }, currentUser] = await Promise.all([
    loadBookingData(),
    getCurrentUser(),
  ]);

  const requestedBarber = barbersList.find(
    (barber) => String(barber.id) === sp.barber || barber.slug === sp.barber,
  );
  const requestedServices = sp.services
    ?.split(",")
    .map((value) => servicesList.find((service) => String(service.id) === value.trim() || service.slug === value.trim()))
    .filter((service): service is BookingServiceItem => Boolean(service));

  const singleService = servicesList.find(
    (service) => String(service.id) === sp.service || service.slug === sp.service || service.name === sp.service,
  );

  const initialServiceIds = (
    requestedServices?.length ? requestedServices : singleService ? [singleService] : []
  ).map((service) => service.id);

  const preference: VisitPreference | undefined =
    sp.pref === "EARLIEST" || sp.pref === "ONE_BARBER" || sp.pref === "PREFERRED_BARBER"
      ? sp.pref
      : sp.only === "1"
        ? "PREFERRED_BARBER"
        : undefined;

  const today = todayISO();
  const initialDate =
    sp.date && isValidISODate(sp.date) && sp.date >= today && sp.date <= addDaysISO(today, 60)
      ? sp.date
      : undefined;

  const minute = sp.time !== undefined && /^\d{1,4}$/.test(sp.time) ? Number(sp.time) : NaN;
  const initialStartMin =
    Number.isInteger(minute) && minute >= 0 && minute < 1440 ? minute : undefined;

  return (
    <main className="min-h-screen bg-[#fdfcf9]">
      <div className="mx-auto mb-1 flex max-w-[720px] items-center justify-between px-4 pt-5 text-xs text-[#59636b] sm:px-6">
        <Link href="/home" className="focus-ring flex min-h-11 items-center gap-1 font-semibold hover:text-[#14432f]">
          <span aria-hidden="true">←</span>
          <span>خانه</span>
        </Link>
        <span className="font-bold text-[#3f5548]">رزرو نوبت</span>
      </div>

      <CustomerBooking
        key={`${initialServiceIds.join("-")}:${requestedBarber?.id ?? 0}:${initialDate ?? ""}:${initialStartMin ?? ""}`}
        servicesList={servicesList}
        barbersList={barbersList}
        initialUser={
          currentUser
            ? {
                id: currentUser.id,
                name: currentUser.name,
                phone: currentUser.phone,
                role: currentUser.role,
              }
            : null
        }
        initialServiceIds={initialServiceIds}
        initialBarberId={requestedBarber?.id}
        initialPreference={preference}
        initialDate={initialDate}
        initialStartMin={initialStartMin}
        demoPhoneHint={demoPhoneHint()}
        policyVersion={POLICY_CURRENT_VERSION}
        policyItems={process.env.BOOKING_POLICY_ITEMS?.split("\n").filter(Boolean) ?? [
          "زمان و آرایشگر انتخابی فقط پس از ثبت نهایی و در صورت نیاز تأیید پرداخت قطعی می‌شود.",
          "در صورت تغییر برنامه، برای لغو یا جابه‌جایی نوبت با پذیرش سالن تماس بگیرید.",
          "مبلغ بیعانه و مانده پیش از ثبت نهایی به شما نمایش داده می‌شود.",
        ]}
      />
    </main>
  );
}
