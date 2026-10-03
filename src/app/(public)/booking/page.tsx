import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { barberServices, barbers, serviceCombinationRules, services } from "@/db/schema";
import {
  CustomerBooking,
  type BookingServiceItem,
  type BookingBarberItem,
} from "@/components/booking/CustomerBooking";
import { getCurrentUser } from "@/lib/session";
import { POLICY_CURRENT_VERSION } from "@/lib/auth-otp";
import { addDaysISO, isValidISODate, todayISO } from "@/lib/time";
import { demoPhoneHint } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "رزرو آنلاین خدمات | آکادمی زیبایی فرشید معروف پور" };

export async function loadBookingData() {
  const [serviceRows, barberRows, links, ruleRows] = await Promise.all([
    db.select().from(services).where(eq(services.active, true)),
    db.select().from(barbers).where(eq(barbers.active, true)),
    db.select().from(barberServices),
    db.select().from(serviceCombinationRules),
  ]);

  const barbersList: BookingBarberItem[] = barberRows.map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    title: b.title,
    serviceIds: links.filter((l) => l.barberId === b.id).map((l) => l.serviceId),
  }));

  const servicesList: BookingServiceItem[] = serviceRows.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    category: s.category || "اصلاح",
    durationMin: s.durationMin,
    basePrice: s.basePrice,
    description: s.description,
    paymentMode: s.paymentMode as "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT",
    depositAmount: s.depositAmount,
  }));

  const combinationRules = ruleRows.map((r) => ({
    a: r.serviceAId,
    b: r.serviceBId,
    canCombine: r.canCombine,
    sameBarberRequired: r.sameBarberRequired,
    note: r.note,
  }));

  return { servicesList, barbersList, combinationRules };
}

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ barber?: string; service?: string; date?: string; time?: string }>;
}) {
  const sp = await searchParams;
  const [{ servicesList, barbersList, combinationRules }, currentUser] = await Promise.all([
    loadBookingData(),
    getCurrentUser(),
  ]);

  const requestedBarber = barbersList.find(
    (b) => String(b.id) === sp.barber || b.slug === sp.barber,
  );
  const requestedService = servicesList.find(
    (s) => String(s.id) === sp.service || s.slug === sp.service || s.name === sp.service,
  );

  const initialService =
    requestedService?.id ??
    requestedBarber?.serviceIds.find((id) => servicesList.some((s) => s.id === id));

  const initialBarber =
    initialService && requestedBarber?.serviceIds.includes(initialService)
      ? requestedBarber.id
      : undefined;

  const today = todayISO();
  const initialDate =
    sp.date && isValidISODate(sp.date) && sp.date >= today && sp.date <= addDaysISO(today, 60)
      ? sp.date
      : today;

  const minute = sp.time !== undefined && /^\d{1,4}$/.test(sp.time) ? Number(sp.time) : NaN;
  const initialStartMin =
    Number.isInteger(minute) && minute >= 0 && minute < 1440 ? minute : undefined;

  return (
    <main className="theme-customer min-h-screen bg-transparent px-4 py-6 text-[#f3f1e7] sm:py-10">
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
        <Link href="/home" className="hover:text-[var(--color-action-primary)] flex items-center gap-1 font-semibold">
          <span>←</span>
          <span>خانه</span>
        </Link>
        <span className="font-bold text-[var(--color-text-secondary)]">رزرو نوبت پیرایش</span>
      </div>

      <CustomerBooking
        key={`${initialBarber}:${initialService}:${initialDate}:${initialStartMin}`}
        servicesList={servicesList}
        barbersList={barbersList}
        combinationRules={combinationRules}
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
        initialBarberId={initialBarber}
        initialServiceId={initialService}
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
