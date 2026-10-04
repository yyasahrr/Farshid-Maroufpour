"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, EmptyState } from "@/components/ui-cards";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { buildAppointmentIcs, downloadIcs } from "@/lib/ics";
import { formatPersianDate, formatPrice, minutesToLabel, todayISO } from "@/lib/time";

export type AppointmentData = { id: number; bookingGroupId: string | null; clientName: string; date: string; startMin: number; endMin: number; priceSnapshot: number; status: string; notes: string; barberName: string; barberSlug: string; serviceName: string; serviceId: number; paymentReference: string | null; paymentStatus: string | null };
export type ClassData = { id: number; title: string; slug: string; startsOn: string; location: string; status: string; paymentReference: string | null; paymentStatus: string | null };
type View = "upcoming" | "past" | "cancelled";
const labels: Record<string, { label: string; tone: "brand" | "success" | "warn" | "danger" | "neutral" }> = {
  PENDING: { label: "در انتظار پرداخت", tone: "warn" }, CONFIRMED: { label: "تأییدشده", tone: "success" },
  CHECKED_IN: { label: "حاضر در سالن", tone: "brand" }, IN_PROGRESS: { label: "در حال انجام", tone: "brand" },
  COMPLETED: { label: "تکمیل‌شده", tone: "neutral" }, NO_SHOW: { label: "عدم حضور", tone: "danger" },
  CANCELLED_BY_CLIENT: { label: "لغوشده", tone: "danger" }, CANCELLED_BY_STAFF: { label: "لغوشده توسط سالن", tone: "danger" }, CANCELLED_EXPIRED: { label: "لغوشده (اتمام مهلت پرداخت)", tone: "danger" },
};

function AppointmentCard({ row, onCancel, featured = false }: { row: AppointmentData; onCancel?: (row: AppointmentData) => void; featured?: boolean }) {
  const status = labels[row.status] ?? { label: row.status, tone: "neutral" as const };
  const cancelable = row.date >= todayISO() && row.status !== "COMPLETED" && !row.status.startsWith("CANCELLED") && row.status !== "CHECKED_IN" && row.status !== "IN_PROGRESS" && row.paymentStatus !== "PAID";
  return <article className={`ui-card p-4 sm:p-5 ${featured ? "!border-[#9bd3d6]" : ""}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#5f7168]">نوبت #{row.id.toLocaleString("fa-IR")}</p><h3 className="mt-1 text-[17px] font-black">{row.serviceName}</h3><p className="mt-1 text-sm text-[#8a6a1e]">{row.barberName}</p>{row.bookingGroupId && <p className="mt-1 text-xs font-semibold text-[#2f4a3a]">بخشی از رزرو گروهی · برای {row.clientName}</p>}</div><Badge tone={status.tone}>{status.label}</Badge></div>
    <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-2 border-y border-[#e2e5df] py-3 text-sm"><div><dt className="text-xs text-[#5f7168]">تاریخ</dt><dd className="mt-1 font-bold">{formatPersianDate(row.date)}</dd></div><div><dt className="text-xs text-[#5f7168]">ساعت</dt><dd className="mt-1 font-bold tabular-nums">{minutesToLabel(row.startMin)}</dd></div><div><dt className="text-xs text-[#5f7168]">هزینه</dt><dd className="mt-1 font-bold tabular-nums">{formatPrice(row.priceSnapshot)}</dd></div></dl>
    {row.status === "PENDING" && row.paymentReference && <Link href={`/pay?ref=${encodeURIComponent(row.paymentReference)}`} className="ui-button mt-4 w-full">{row.paymentStatus === "FAILED" ? "تلاش دوباره برای پرداخت" : "تکمیل پرداخت و تأیید نوبت"}</Link>}
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><button type="button" onClick={() => downloadIcs(`booking-${row.id}.ics`, buildAppointmentIcs({ title: `${row.serviceName}، فرشید معروف پور`, description: `کد ${row.id} · ${row.barberName}`, date: row.date, startMin: row.startMin, durationMin: row.endMin - row.startMin, location: "تهران، خیابان ولیعصر، پلاک ۱۲", referenceId: row.id }))} className="focus-ring min-h-11 font-semibold text-[#2f4a3a]">افزودن به تقویم</button><Link className="ui-link" href={`/barbers/${row.barberSlug}`}>پروفایل آرایشگر</Link>{cancelable && onCancel && <button type="button" onClick={() => onCancel(row)} className="focus-ring min-h-11 font-semibold text-rose-700">{row.bookingGroupId ? "لغو همه نوبت‌های گروه" : "لغو نوبت"}</button>}{row.paymentStatus === "PAID" && <a className="ui-link" href="tel:+982191000000">تغییر/لغو با پذیرش</a>}</div>
    {row.notes && <details className="mt-3 text-sm text-[#5f7168]"><summary className="focus-ring min-h-11 cursor-pointer py-2 font-semibold">یادداشت نوبت</summary><p className="leading-7">{row.notes}</p></details>}
  </article>;
}

export type OnlineCourseRow = { id: number; title: string; slug: string; status: string; grade: number | null; resultNote: string; totalLessons: number; doneLessons: number; paymentReference: string | null };

export function CustomerPanelClient({ user, upcoming, past, cancelled, enrolledClasses, enrolledCourses = [] }: { user: { id: number; name: string; phone: string; role: string }; upcoming: AppointmentData[]; past: AppointmentData[]; cancelled: AppointmentData[]; enrolledClasses: ClassData[]; enrolledCourses?: OnlineCourseRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState<View>("upcoming");
  const [target, setTarget] = useState<AppointmentData | null>(null);
  const [name, setName] = useState(user.name);
  const [profileBusy, setProfileBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [message, setMessage] = useState("");
  const rows = filter === "upcoming" ? upcoming : filter === "past" ? past : cancelled;
  useEffect(() => {
    const node = dialog.current;
    if (target && node && !node.open) node.showModal();
    return () => { if (node?.open) node.close(); };
  }, [target]);

  async function cancelBooking() {
    if (!target || cancelBusy) return;
    setCancelBusy(true);
    try {
      const response = await fetch("/api/booking/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ appointmentId: target.id }) });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "لغو نوبت انجام نشد.");
      dialog.current?.close();
      setTarget(null);
      toast.push(target.bookingGroupId ? "نوبت‌های گروهی لغو شدند." : "نوبت لغو شد.", "success");
      router.refresh();
    } catch (err) { toast.push(err instanceof Error ? err.message : "لغو نوبت انجام نشد.", "error"); }
    finally { setCancelBusy(false); }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (profileBusy || name.trim().length < 2) return;
    setProfileBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "نام ذخیره نشد.");
      setMessage("نام شما ذخیره شد.");
      router.refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "نام ذخیره نشد."); }
    finally { setProfileBusy(false); }
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/home"); router.refresh();
  }
  return <div className="mx-auto max-w-[960px]">
    <div className="ui-pagehead"><p className="!mt-0 !text-[#2f4a3a]">پنل من</p><h1>سلام، {user.name || "همراه گرامی"}</h1><p>نوبت‌ها و دوره‌های خود را اینجا ببینید.</p></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_265px]"><div className="min-w-0 space-y-9">
      <section aria-labelledby="next-booking"><div className="ui-section-head"><h2 id="next-booking">نوبت بعدی</h2><Link className="ui-link" href="/booking">رزرو نوبت تازه</Link></div>{upcoming[0] ? <AppointmentCard row={upcoming[0]} featured onCancel={setTarget} /> : <EmptyState title="هنوز نوبت آینده ندارید" description="زمان دلخواه خود را پیدا کنید و آنلاین رزرو کنید." action={<Link className="ui-button" href="/booking">رزرو نوبت</Link>} />}</section>
      <section id="bookings" aria-labelledby="bookings-title" className="scroll-mt-24"><div className="ui-section-head"><h2 id="bookings-title">نوبت‌های من</h2></div><div role="group" aria-label="فیلتر نوبت‌ها" className="mb-4 flex rounded-xl border border-[#e2e5df] bg-white p-1">{([{ id: "upcoming", label: "آینده", count: upcoming.length }, { id: "past", label: "گذشته", count: past.length }, { id: "cancelled", label: "لغوشده", count: cancelled.length }] as const).map((tab) => <button key={tab.id} type="button" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)} className={`focus-ring min-h-11 flex-1 rounded-lg text-xs font-bold sm:text-sm ${filter === tab.id ? "bg-[#1f2e27] text-white" : "text-[#5f7168]"}`}>{tab.label} ({tab.count.toLocaleString("fa-IR")})</button>)}</div><div className="space-y-3">{rows.length ? rows.map((row) => <AppointmentCard key={row.id} row={row} onCancel={filter === "upcoming" ? setTarget : undefined} />) : <EmptyState title={filter === "upcoming" ? "نوبت آینده دیگری ندارید" : filter === "past" ? "هنوز نوبت گذشته‌ای ندارید" : "نوبت لغوشده‌ای ندارید"} />}</div></section>
      <section id="classes" aria-labelledby="classes-title" className="scroll-mt-24"><div className="ui-section-head"><h2 id="classes-title">کلاس‌های من</h2><Link className="ui-link" href="/academy">دیدن دوره‌ها</Link></div>{enrolledClasses.length ? <div className="space-y-3">{enrolledClasses.map((course) => <article key={course.id} className="ui-card p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold">{course.title}</h3><p className="mt-1 text-sm text-[#5f7168]">شروع {formatPersianDate(course.startsOn)} · {course.location}</p></div><Badge tone={course.status === "CONFIRMED" ? "success" : "warn"}>{course.status === "CONFIRMED" ? "ثبت‌نام تأییدشده" : "در انتظار پرداخت"}</Badge></div><div className="mt-4 flex flex-wrap items-center gap-3"><Link className="ui-link" href={`/classes/${course.slug}`}>جزئیات</Link>{course.status === "PENDING" && course.paymentReference && <Link href={`/pay?ref=${encodeURIComponent(course.paymentReference)}`} className="ui-button !min-h-11 !text-xs">تکمیل پرداخت</Link>}</div></article>)}</div> : <EmptyState title="کلاس فعالی ندارید" description="دوره‌های آکادمی را ببینید و مسیر مناسب خود را انتخاب کنید." />}</section>
<section id="online-courses" aria-labelledby="online-courses-title" className="mt-10 scroll-mt-24"><div className="ui-section-head"><h2 id="online-courses-title">دوره‌های آنلاین من</h2><Link className="ui-link" href="/academy#online">دیدن دوره‌ها</Link></div>{enrolledCourses.length ? <div className="space-y-3">{enrolledCourses.map((course) => <article key={course.id} className="ui-card p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold">{course.title}</h3><p className="mt-1 text-sm text-[#5f7168]">{course.doneLessons.toLocaleString("fa-IR")} از {course.totalLessons.toLocaleString("fa-IR")} درس دیده‌شده{course.grade !== null ? ` · نمره ${(course.grade / 5).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} از ۲۰` : ""}</p></div><Badge tone={course.status === "ACTIVE" || course.status === "COMPLETED" ? "success" : course.status === "PENDING" ? "warn" : "neutral"}>{course.status === "ACTIVE" ? "در حال یادگیری" : course.status === "COMPLETED" ? "کامل شده" : course.status === "PENDING" ? "در انتظار پرداخت" : "لغو شده"}</Badge></div>{course.resultNote && <p className="mt-2 rounded-xl bg-[#f6f5f1] p-3 text-xs leading-7 text-[#41504a]">بازخورد مدرس: {course.resultNote}</p>}<div className="mt-4 flex flex-wrap items-center gap-3">{course.status !== "PENDING" && course.status !== "CANCELLED" && <Link className="ui-button !min-h-11 !text-xs" href={`/courses/${course.slug}/learn`}>ادامهٔ دوره</Link>}{course.status === "PENDING" && course.paymentReference && <Link href={`/pay?ref=${encodeURIComponent(course.paymentReference)}`} className="ui-button !min-h-11 !text-xs">تکمیل پرداخت</Link>}<Link className="ui-link" href={`/courses/${course.slug}`}>صفحهٔ دوره</Link></div></article>)}</div> : <EmptyState title="دورهٔ آنلاینی ثبت‌نام نکرده‌اید" description="دوره‌های ویدیویی با سرفصل، تیزر و مدرک در بخش آکادمی هستند." />}</section>
    </div><aside className="space-y-4 lg:sticky lg:top-24 lg:self-start"><section id="profile" className="ui-panel scroll-mt-24"><h2 className="font-black">پروفایل</h2><p dir="ltr" className="mt-1 text-sm text-[#5f7168]">{user.phone}</p><form onSubmit={(event) => void saveProfile(event)} className="mt-4"><label htmlFor="account-name" className="ui-label">نام و نام خانوادگی</label><input id="account-name" className="ui-input" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} /><button type="submit" disabled={profileBusy || name.trim().length < 2} className="ui-button mt-3 w-full">{profileBusy ? "در حال ذخیره…" : "ذخیره نام"}</button>{message && <p role="status" className="mt-2 text-sm text-[#2f4a3a]">{message}</p>}</form><button type="button" onClick={() => void logout()} className="focus-ring mt-4 min-h-11 text-sm font-semibold text-[#9f3b4c]">خروج از حساب</button></section><div className="grid grid-cols-2 gap-2 lg:grid-cols-1"><Link href="/shop" className="rounded-2xl bg-[#f7f0d8] p-4 text-sm font-bold text-[#6b5213]">فروشگاه</Link><Link href="/academy" className="rounded-2xl bg-[#e3f0e9] p-4 text-sm font-bold text-[#2f4a3a]">آکادمی</Link></div></aside></div>
    {target && <dialog ref={dialog} aria-labelledby="cancel-title" onClose={() => setTarget(null)} className="auth-dialog w-[min(420px,calc(100vw-24px))] rounded-2xl bg-white p-6 text-[#1f2e27]"><h2 id="cancel-title" className="text-lg font-black">{target.bookingGroupId ? "لغو همه نوبت‌های گروه؟" : "لغو نوبت؟"}</h2><p className="mt-3 text-sm leading-7 text-[#5f7168]">{target.bookingGroupId ? "تمام نوبت‌های این رزرو گروهی لغو می‌شوند." : `نوبت ${target.serviceName} در ${formatPersianDate(target.date)} ساعت ${minutesToLabel(target.startMin)} لغو می‌شود.`} این کار قابل بازگشت نیست.</p><p className="mt-3 text-xs text-[#5f7168]">برای نوبت دارای پرداخت تأییدشده باید با پذیرش هماهنگ کنید.</p><div className="mt-6 grid grid-cols-2 gap-2"><button type="button" className="ui-button ui-button-quiet" onClick={() => dialog.current?.close()}>بازگشت</button><button type="button" className="ui-button !bg-[#9f3b4c]" onClick={() => void cancelBooking()} disabled={cancelBusy}>{cancelBusy ? "در حال لغو…" : target.bookingGroupId ? "لغو گروه" : "لغو نوبت"}</button></div></dialog>}
  </div>;
}
