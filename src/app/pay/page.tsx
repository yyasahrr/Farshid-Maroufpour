import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, barbers, classRegistrations, classes, courseEnrollments, courses, payments, services } from "@/db/schema";
import { PayButtons } from "@/components/pay-buttons";
import { PaymentCountdown } from "@/components/payment-countdown";
import { getCurrentUser } from "@/lib/session";
import { currentEpochMs, formatPersianDate, formatPrice, minutesToLabel } from "@/lib/time";
import { isPaymentDemoMode } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "پرداخت نوبت" };

export default async function PayPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/account");
  const { ref } = await searchParams;
  if (!ref || ref.length > 100) return <main className="ui-container ui-page"><div className="ui-panel mx-auto max-w-lg text-center"><h1 className="text-xl font-black">شناسه پرداخت وارد نشده است</h1><Link className="ui-button mt-5" href="/account">مشاهده نوبت‌ها</Link></div></main>;
  const [payment] = await db.select().from(payments).where(eq(payments.reference, ref)).limit(1);
  if (!payment) notFound();
  let heading = "ثبت‌نام آکادمی";
  let booking: { id: number; service: string; barber: string; date: string; time: number; price: number; expiresAt: number }[] = [];
  if (payment.kind === "APPOINTMENT" || payment.kind === "APPOINTMENT_GROUP") {
    const [appt] = await db.select({ a: appointments, service: services.name, barber: barbers.name })
      .from(appointments).innerJoin(services, eq(appointments.serviceId, services.id))
      .innerJoin(barbers, eq(appointments.barberId, barbers.id))
      .where(eq(appointments.id, payment.refId)).limit(1);
    if (!appt || appt.a.clientPhone !== user.phone) notFound();
    if (payment.kind === "APPOINTMENT_GROUP") {
      if (!appt.a.bookingGroupId) notFound();
      const groupRows = await db.select({ a: appointments, service: services.name, barber: barbers.name })
        .from(appointments).innerJoin(services, eq(appointments.serviceId, services.id))
        .innerJoin(barbers, eq(appointments.barberId, barbers.id))
        .where(eq(appointments.bookingGroupId, appt.a.bookingGroupId));
      if (groupRows.length === 0 || groupRows.some((item) => item.a.clientPhone !== user.phone)) notFound();
      booking = groupRows.map((item) => ({
        id: item.a.id,
        service: item.service,
        barber: item.barber,
        date: item.a.date,
        time: item.a.startMin,
        price: item.a.priceSnapshot,
        expiresAt: item.a.createdAt.getTime() + 600_000,
      }));
      heading = `رزرو گروهی (${groupRows.length} نوبت)`;
    } else {
      booking = [{ id: appt.a.id, service: appt.service, barber: appt.barber, date: appt.a.date, time: appt.a.startMin, price: appt.a.priceSnapshot, expiresAt: appt.a.createdAt.getTime() + 600_000 }];
      heading = appt.service;
    }
  } else if (payment.kind === "CLASS") {
    const [registration] = await db.select({ title: classes.title, phone: classRegistrations.studentPhone })
      .from(classRegistrations).innerJoin(classes, eq(classRegistrations.classId, classes.id))
      .where(eq(classRegistrations.id, payment.refId)).limit(1);
    if (!registration || registration.phone !== user.phone) notFound();
    heading = registration.title;
  } else if (payment.kind === "COURSE") {
    const [registration] = await db
      .select({ title: courses.title, userId: courseEnrollments.userId })
      .from(courseEnrollments)
      .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
      .where(eq(courseEnrollments.id, payment.refId))
      .limit(1);
    if (!registration || registration.userId !== user.id) notFound();
    heading = `دورهٔ آنلاین: ${registration.title}`;
  } else notFound();
  const seconds = booking.length ? Math.max(0, Math.ceil((Math.min(...booking.map((item) => item.expiresAt)) - currentEpochMs()) / 1000)) : 1;
  const payable = (payment.status === "PENDING" || payment.status === "FAILED") && seconds > 0;
  return <main className="ui-shell ui-container ui-page"><div className="mx-auto max-w-[620px]">
    <Link className="ui-link" href="/account">بازگشت به نوبت‌های من</Link>
    <div className="ui-pagehead mt-6"><h1>{payment.status === "PAID" ? "پرداخت تأیید شد" : "پرداخت نوبت"}</h1><p>مبلغ و وضعیت پرداخت را پیش از ادامه بررسی کنید.</p></div>
    <div className="ui-panel"><span className="ui-pill ui-tag-booking">{isPaymentDemoMode() ? "پرداخت آزمایشی پیش‌نمایش" : "پرداخت آنلاین"}</span>
      <h2 className="mt-4 text-xl font-black">{heading}</h2>
      {booking.length > 0 && <ol className="mt-3 space-y-2 text-sm text-bone-500">{booking.map((item) => <li key={item.id} className="rounded-xl bg-bone-100 p-3">{item.service} · {item.barber} · {formatPersianDate(item.date)}، {minutesToLabel(item.time)}</li>)}</ol>}
      <dl className="mt-6 space-y-3 border-y border-bone-150 py-4 text-sm"><div className="flex justify-between gap-2"><dt className="text-bone-500">مبلغ کل خدمت</dt><dd className="font-bold">{formatPrice(booking.length ? booking.reduce((sum, item) => sum + item.price, 0) : payment.amount)}</dd></div><div className="flex justify-between gap-2"><dt className="text-bone-500">مبلغ این پرداخت</dt><dd className="font-black text-brand-400">{formatPrice(payment.amount)}</dd></div>{booking.length > 0 && booking.reduce((sum, item) => sum + item.price, 0) > payment.amount && <div className="flex justify-between gap-2"><dt className="text-bone-500">مانده در سالن</dt><dd className="font-bold">{formatPrice(booking.reduce((sum, item) => sum + item.price, 0) - payment.amount)}</dd></div>}<div className="flex justify-between gap-2"><dt className="text-bone-500">وضعیت</dt><dd className="font-bold">{payment.status === "PAID" ? "تأییدشده" : payment.status === "PENDING" ? "در انتظار پرداخت" : payment.status === "FAILED" ? "پرداخت ناموفق" : "بسته شده"}</dd></div></dl>
      {payable && booking.length > 0 && <PaymentCountdown expiresAt={Math.min(...booking.map((item) => item.expiresAt))} initialSeconds={seconds} />}
      {payable && (isPaymentDemoMode() ? <PayButtons reference={payment.reference} /> : <p role="status" className="mt-4 rounded-xl bg-brass-50 p-4 text-sm leading-7">درگاه آنلاین در این محیط فعال نیست. برای هماهنگی با پذیرش تماس بگیرید.</p>)}
      {payment.status === "PAID" && <p className="mt-4 rounded-xl bg-[#e4ece3] p-4 text-sm font-semibold text-brand-400">پرداخت سمت سرور تأیید شده و {booking.length > 0 ? "نوبت‌های شما قطعی هستند" : "ثبت‌نام شما ثبت شده است"}.</p>}
      {(!payable && payment.status !== "PAID") && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">مهلت این پرداخت به پایان رسیده است یا تراکنش بسته شده است.</p>}
      <Link href="/account" className="ui-button ui-button-quiet mt-5 w-full">مشاهده نوبت‌های من</Link>
      <p dir="ltr" className="mt-5 break-all text-center text-xs text-bone-500">{payment.reference}</p>
    </div>
  </div></main>;
}
