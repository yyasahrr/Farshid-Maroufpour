"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, EmptyState } from "@/components/ui-cards";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { buildAppointmentIcs, downloadIcs } from "@/lib/ics";
import { CONTACT_ADDRESS, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL } from "@/lib/site";
import { formatPersianDate, formatPrice, minutesToLabel, todayISO } from "@/lib/time";

/**
 * Customer panel — mobile first, visit first.
 *
 * A visit with several services (possibly several barbers) is ONE card with one
 * status, one price and one cancellation, matching how the salon and the server
 * treat it.
 */

export type CustomerVisit = {
  key: string;
  bookingGroupId: string | null;
  date: string;
  startMin: number;
  endMin: number;
  status: string;
  barberNames: string[];
  barberSlug: string;
  oneBarber: boolean;
  price: number;
  notes: string;
  segments: { id: number; serviceName: string; barberName: string; startMin: number; endMin: number }[];
  paymentReference: string | null;
  paymentStatus: string | null;
};

export type ClassData = {
  id: number;
  title: string;
  slug: string;
  startsOn: string;
  location: string;
  status: string;
  paymentReference: string | null;
  paymentStatus: string | null;
};

type View = "upcoming" | "past" | "cancelled";

const labels: Record<string, { label: string; tone: "brand" | "success" | "warn" | "danger" | "neutral" }> = {
  PENDING: { label: "در انتظار پرداخت", tone: "warn" },
  CONFIRMED: { label: "تأییدشده", tone: "success" },
  CHECKED_IN: { label: "حاضر در سالن", tone: "brand" },
  IN_PROGRESS: { label: "در حال انجام", tone: "brand" },
  COMPLETED: { label: "تکمیل‌شده", tone: "neutral" },
  NO_SHOW: { label: "عدم حضور", tone: "danger" },
  CANCELLED_BY_CLIENT: { label: "لغوشده", tone: "danger" },
  CANCELLED_BY_STAFF: { label: "لغوشده توسط سالن", tone: "danger" },
};

function VisitCard({
  visit,
  onCancel,
  featured = false,
}: {
  visit: CustomerVisit;
  onCancel?: (visit: CustomerVisit) => void;
  featured?: boolean;
}) {
  const status = labels[visit.status] ?? { label: visit.status, tone: "neutral" as const };
  const [detailsOpen, setDetailsOpen] = useState(featured);
  const cancelable =
    visit.date >= todayISO() &&
    !visit.status.startsWith("CANCELLED") &&
    visit.status !== "COMPLETED" &&
    visit.status !== "CHECKED_IN" &&
    visit.status !== "IN_PROGRESS" &&
    visit.paymentStatus !== "PAID";

  return (
    <article className={`ui-card p-4 sm:p-5 ${featured ? "!border-[#9bd3d6]" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#3f5548]">{formatPersianDate(visit.date)}</p>
          <h3 className="mt-1 text-[17px] font-black tabular-nums">
            {minutesToLabel(visit.startMin)}
            {visit.endMin > visit.startMin && (
              <>
                <span className="mx-1.5 text-sm font-bold text-[#59636b]">تا</span>
                {minutesToLabel(visit.endMin)}
              </>
            )}
          </h3>
          <p className="mt-1 text-sm text-[#59636b]">
            {visit.segments.length.toLocaleString("fa-IR")} خدمت · {visit.barberNames.join(" + ")}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <ol className="mt-4 space-y-1.5">
        {visit.segments.map((segment) => (
          <li key={segment.id} className="flex items-center gap-3 text-sm">
            <span className="w-[100px] shrink-0 font-bold tabular-nums" dir="ltr">
              {minutesToLabel(segment.startMin)}–{minutesToLabel(segment.endMin)}
            </span>
            <span className="min-w-0 flex-1 truncate">{segment.serviceName}</span>
            <span className="shrink-0 text-xs text-[#59636b]">{segment.barberName}</span>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-sm font-bold tabular-nums">{formatPrice(visit.price)}</p>

      {visit.status === "PENDING" && visit.paymentReference && (
        <Link href={`/pay?ref=${encodeURIComponent(visit.paymentReference)}`} className="ui-button mt-4 w-full">
          {visit.paymentStatus === "FAILED" ? "تلاش دوباره برای پرداخت" : "تکمیل پرداخت و تأیید نوبت"}
        </Link>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          aria-expanded={detailsOpen}
          className="focus-ring min-h-11 font-semibold text-[#14432f]"
        >
          {detailsOpen ? "بستن جزئیات" : "مشاهده جزئیات"}
        </button>
        <button
          type="button"
          onClick={() =>
            downloadIcs(
              `visit-${visit.date}.ics`,
              buildAppointmentIcs({
                title: `${visit.segments.map((segment) => segment.serviceName).join(" + ")}، فرشید معروف پور`,
                description: visit.segments.map((segment) => `${segment.serviceName} — ${segment.barberName}`).join(" · "),
                location: CONTACT_ADDRESS,
                date: visit.date,
                startMin: visit.startMin,
                durationMin: Math.max(visit.endMin - visit.startMin, 30),
                referenceId: visit.key,
              }),
            )
          }
          className="focus-ring min-h-11 font-semibold text-[#14432f]"
        >
          افزودن به تقویم
        </button>
        <a href={`tel:${CONTACT_PHONE_TEL}`} className="focus-ring min-h-11 font-semibold text-[#14432f]">
          تماس برای تغییر زمان
        </a>
        {visit.oneBarber && visit.barberSlug && (
          <Link className="ui-link" href={`/barbers/${visit.barberSlug}`}>
            پروفایل آرایشگر
          </Link>
        )}
        {cancelable && onCancel && (
          <button type="button" onClick={() => onCancel(visit)} className="focus-ring min-h-11 font-semibold text-[#9f3b4c]">
            لغو نوبت
          </button>
        )}
        {visit.paymentStatus === "PAID" && (
          <a className="ui-link" href={`tel:${CONTACT_PHONE_TEL}`}>
            تغییر/لغو با پذیرش
          </a>
        )}
      </div>

      {detailsOpen && (
        <div className="mt-3 space-y-2 rounded-2xl bg-[#f6f5f1] p-3.5 text-xs leading-6 text-[#59636b]">
          <p className="flex items-start gap-2">
            <Icon name="location" className="mt-0.5 h-4 w-4 shrink-0 text-[#14432f]" />
            {CONTACT_ADDRESS}
          </p>
          <p>
            مجموع زمان: {(visit.endMin - visit.startMin).toLocaleString("fa-IR")} دقیقه
            {visit.barberNames.length > 1
              ? ` · ${visit.barberNames.length.toLocaleString("fa-IR")} آرایشگر به‌ترتیب روی این نوبت کار می‌کنند`
              : " · همهٔ خدمات با یک آرایشگر"}
          </p>
          {visit.notes && <p>یادداشت: {visit.notes}</p>}
          <p dir="ltr" className="font-semibold">
            {CONTACT_PHONE_DISPLAY}
          </p>
        </div>
      )}
    </article>
  );
}

export function CustomerPanelClient({
  user,
  upcoming,
  past,
  cancelled,
  enrolledClasses,
}: {
  user: { id: number; name: string; phone: string; role: string };
  upcoming: CustomerVisit[];
  past: CustomerVisit[];
  cancelled: CustomerVisit[];
  enrolledClasses: ClassData[];
}) {
  const router = useRouter();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState<View>("upcoming");
  const [target, setTarget] = useState<CustomerVisit | null>(null);
  const [name, setName] = useState(user.name);
  const [profileBusy, setProfileBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [message, setMessage] = useState("");
  const rows = filter === "upcoming" ? upcoming : filter === "past" ? past : cancelled;

  useEffect(() => {
    const node = dialog.current;
    if (target && node && !node.open) node.showModal();
    return () => {
      if (node?.open) node.close();
    };
  }, [target]);

  async function cancelBooking() {
    if (!target || cancelBusy) return;
    setCancelBusy(true);
    try {
      const response = await fetch("/api/booking/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appointmentId: target.segments[0].id }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "لغو نوبت انجام نشد.");
      dialog.current?.close();
      setTarget(null);
      toast.push(target.segments.length > 1 ? "این نوبت کامل لغو شد." : "نوبت لغو شد.", "success");
      router.refresh();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "لغو نوبت انجام نشد.", "error");
    } finally {
      setCancelBusy(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (profileBusy || name.trim().length < 2) return;
    setProfileBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "نام ذخیره نشد.");
      setMessage("نام شما ذخیره شد.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "نام ذخیره نشد.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/home");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="ui-pagehead">
        <p className="!mt-0 !text-[#14432f]">پنل من</p>
        <h1>سلام، {user.name || "همراه گرامی"}</h1>
        <p>نوبت بعدی، سابقهٔ مراجعه و دوره‌های شما اینجاست.</p>
      </div>

      <section aria-labelledby="next-visit" className="mb-8">
        <div className="ui-section-head">
          <h2 id="next-visit">نوبت بعدی</h2>
          <Link className="ui-link" href="/booking">
            + رزرو جدید
          </Link>
        </div>
        {upcoming[0] ? (
          <VisitCard visit={upcoming[0]} featured onCancel={setTarget} />
        ) : (
          <EmptyState
            title="هنوز نوبت آینده ندارید"
            description="خدمت‌های مورد نیازتان را انتخاب کنید؛ سیستم زودترین زمان کامل را پیدا می‌کند."
            action={
              <Link className="ui-button" href="/booking">
                رزرو نوبت
              </Link>
            }
          />
        )}
      </section>

      <section id="bookings" aria-labelledby="bookings-title" className="mb-8 scroll-mt-24">
        <div className="ui-section-head">
          <h2 id="bookings-title">نوبت‌های من</h2>
        </div>
        <div role="group" aria-label="فیلتر نوبت‌ها" className="mb-4 flex rounded-xl border border-[#e5e0d4] bg-white p-1">
          {(
            [
              { id: "upcoming", label: "آینده", count: upcoming.length },
              { id: "past", label: "گذشته", count: past.length },
              { id: "cancelled", label: "لغوشده", count: cancelled.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={`focus-ring min-h-11 flex-1 rounded-lg text-xs font-bold sm:text-sm ${
                filter === tab.id ? "bg-[#1a2e25] text-white" : "text-[#59636b]"
              }`}
            >
              {tab.label} ({tab.count.toLocaleString("fa-IR")})
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {rows.length ? (
            rows.map((visit) => (
              <VisitCard key={visit.key} visit={visit} onCancel={filter === "upcoming" ? setTarget : undefined} />
            ))
          ) : (
            <EmptyState
              title={
                filter === "upcoming"
                  ? "نوبت آینده دیگری ندارید"
                  : filter === "past"
                    ? "هنوز نوبت گذشته‌ای ندارید"
                    : "نوبت لغوشده‌ای ندارید"
              }
            />
          )}
        </div>
      </section>

      <section id="classes" aria-labelledby="classes-title" className="mb-8 scroll-mt-24">
        <div className="ui-section-head">
          <h2 id="classes-title">کلاس‌های من</h2>
          <Link className="ui-link" href="/academy">
            دیدن دوره‌ها
          </Link>
        </div>
        {enrolledClasses.length ? (
          <div className="space-y-3">
            {enrolledClasses.map((course) => (
              <article key={course.id} className="ui-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold">{course.title}</h3>
                    <p className="mt-1 text-sm text-[#59636b]">
                      شروع {formatPersianDate(course.startsOn)} · {course.location}
                    </p>
                  </div>
                  <Badge tone={course.status === "CONFIRMED" ? "success" : "warn"}>
                    {course.status === "CONFIRMED" ? "ثبت‌نام تأییدشده" : "در انتظار پرداخت"}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link className="ui-link" href={`/classes/${course.slug}`}>
                    جزئیات
                  </Link>
                  {course.status === "PENDING" && course.paymentReference && (
                    <Link href={`/pay?ref=${encodeURIComponent(course.paymentReference)}`} className="ui-button !min-h-11 !text-xs">
                      تکمیل پرداخت
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="کلاس فعالی ندارید" description="دوره‌های آکادمی را ببینید و مسیر مناسب خود را انتخاب کنید." />
        )}
      </section>

      <section id="profile" className="ui-panel scroll-mt-24">
        <h2 className="font-black">پروفایل</h2>
        <p dir="ltr" className="mt-1 text-sm text-[#59636b]">
          {user.phone}
        </p>
        <form onSubmit={(event) => void saveProfile(event)} className="mt-4">
          <label htmlFor="account-name" className="ui-label">
            نام و نام خانوادگی
          </label>
          <input
            id="account-name"
            className="ui-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
          <button type="submit" disabled={profileBusy || name.trim().length < 2} className="ui-button mt-3 w-full">
            {profileBusy ? "در حال ذخیره…" : "ذخیره نام"}
          </button>
          {message && (
            <p role="status" className="mt-2 text-sm text-[#14432f]">
              {message}
            </p>
          )}
        </form>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link href="/shop" className="focus-ring rounded-2xl bg-[#f7f0d8] p-4 text-sm font-bold text-[#6b5213]">
            فروشگاه
          </Link>
          <Link href="/academy" className="focus-ring rounded-2xl bg-[#e3f0e9] p-4 text-sm font-bold text-[#14432f]">
            آکادمی
          </Link>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="focus-ring mt-4 min-h-11 text-sm font-semibold text-[#9f3b4c]"
        >
          خروج از حساب
        </button>
      </section>

      {target && (
        <dialog
          ref={dialog}
          aria-labelledby="cancel-title"
          onClose={() => setTarget(null)}
          className="auth-dialog w-[min(420px,calc(100vw-24px))] rounded-2xl bg-white p-6 text-[#1a2e25]"
        >
          <h2 id="cancel-title" className="text-lg font-black">
            {target.segments.length > 1 ? "لغو این نوبت کامل؟" : "لغو نوبت؟"}
          </h2>
          <p className="mt-3 text-sm leading-7 text-[#59636b]">
            {`نوبت ${formatPersianDate(target.date)} ساعت ${minutesToLabel(target.startMin)}`}
            {target.segments.length > 1
              ? ` شامل ${target.segments.length.toLocaleString("fa-IR")} خدمت است و همهٔ آن‌ها لغو می‌شوند.`
              : " لغو می‌شود."}{" "}
            این کار قابل بازگشت نیست.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button type="button" className="ui-button ui-button-quiet" onClick={() => dialog.current?.close()}>
              بازگشت
            </button>
            <button
              type="button"
              className="ui-button !bg-[#9f3b4c]"
              onClick={() => void cancelBooking()}
              disabled={cancelBusy}
            >
              {cancelBusy ? "در حال لغو…" : "لغو نوبت"}
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
