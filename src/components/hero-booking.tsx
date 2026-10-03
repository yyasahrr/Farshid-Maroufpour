"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Icon, type IconName } from "@/components/icons";
import { formatPersianDate, minutesToLabel } from "@/lib/time";
import type { ReactNode, KeyboardEvent } from "react";

export type HeroBookingData = {
  services: { id: number; name: string }[];
  barbers: { id: number; name: string; serviceIds: number[] }[];
  courses: {
    slug: string;
    title: string;
    instructor: string | null;
    startsOn: string;
    available: number;
  }[];
  dates: { value: string; label: string }[];
};

type TimeChoice = { startMin: number; barberId: number };
const slotsSchema = z.object({
  slots: z.array(
    z.object({
      startMin: z.number().int(),
      state: z.enum(["AVAILABLE", "BOOKED", "CLOSED"]),
    }),
  ),
});

function BookingField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <label className="hero-booking-field">
      <span className="hero-field-label">{label}</span>
      <span className="hero-field-control">
        <Icon name={icon} />
        {children}
        <Icon name="chevron" className="field-chevron" />
      </span>
    </label>
  );
}

export function HeroBooking({
  services,
  barbers,
  courses,
  dates,
}: HeroBookingData) {
  const router = useRouter();
  const [tab, setTab] = useState<"services" | "academy">("services");
  const [serviceId, setServiceId] = useState("");
  const [barberId, setBarberId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [courseSlug, setCourseSlug] = useState("");
  const [retry, setRetry] = useState(0);
  const [pending, startTransition] = useTransition();
  const [availability, setAvailability] = useState<{
    key: string;
    slots: TimeChoice[];
    error: string | null;
  }>({ key: "", slots: [], error: null });
  const eligible = useMemo(
    () =>
      barbers.filter(
        (b) => !serviceId || b.serviceIds.includes(Number(serviceId)),
      ),
    [barbers, serviceId],
  );
  const candidates = useMemo(
    () => eligible.filter((b) => !barberId || b.id === Number(barberId)),
    [eligible, barberId],
  );
  const key = `${serviceId}:${barberId}:${date}:${retry}`;
  const ready = Boolean(serviceId && date && candidates.length);
  const loading = ready && availability.key !== key;
  const choices = availability.key === key ? availability.slots : [];
  const error = availability.key === key ? availability.error : null;
  const course = courses.find((c) => c.slug === courseSlug);

  useEffect(() => {
    if (!ready || tab !== "services") return;
    const controller = new AbortController();
    async function load() {
      try {
        const days = await Promise.all(
          candidates.map(async (barber) => {
            const params = new URLSearchParams({
              barberId: String(barber.id),
              serviceId,
              date,
            });
            const response = await fetch(`/api/availability?${params}`, {
              signal: controller.signal,
              cache: "no-store",
            });
            if (!response.ok) throw new Error("availability");
            const data = slotsSchema.parse(await response.json());
            return data.slots
              .filter((s) => s.state === "AVAILABLE")
              .map((s) => ({ startMin: s.startMin, barberId: barber.id }));
          }),
        );
        const unique = new Map<number, TimeChoice>();
        for (const slot of days
          .flat()
          .sort((a, b) => a.startMin - b.startMin || a.barberId - b.barberId)) {
          if (!unique.has(slot.startMin)) unique.set(slot.startMin, slot);
        }
        if (!controller.signal.aborted)
          setAvailability({ key, slots: [...unique.values()], error: null });
      } catch {
        if (!controller.signal.aborted)
          setAvailability({
            key,
            slots: [],
            error: "دریافت ساعت‌ها ممکن نشد. دوباره تلاش کنید.",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, candidates, serviceId, date, ready, tab]);

  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? "services"
        : event.key === "End"
          ? "academy"
          : tab === "services"
            ? "academy"
            : "services";
    setTab(target);
    document.getElementById(`hero-tab-${target}`)?.focus();
  }

  return (
    <div className="hero-reservation" id="reserve">
      <div
        className="hero-booking-tabs"
        role="tablist"
        aria-label="انتخاب نوع رزرو"
      >
        <button
          id="hero-tab-services"
          role="tab"
          type="button"
          aria-selected={tab === "services"}
          aria-controls="hero-booking-panel"
          tabIndex={tab === "services" ? 0 : -1}
          onKeyDown={tabKey}
          onClick={() => setTab("services")}
          className={
            tab === "services"
              ? "hero-booking-tab is-active"
              : "hero-booking-tab"
          }
        >
          <Icon name="calendar" />
          <span>رزرو خدمات</span>
        </button>
        <button
          id="hero-tab-academy"
          role="tab"
          type="button"
          aria-selected={tab === "academy"}
          aria-controls="hero-booking-panel"
          tabIndex={tab === "academy" ? 0 : -1}
          onKeyDown={tabKey}
          onClick={() => setTab("academy")}
          className={
            tab === "academy"
              ? "hero-booking-tab is-active"
              : "hero-booking-tab"
          }
        >
          <Icon name="cap" />
          <span>دوره‌های آکادمی</span>
        </button>
      </div>
      <form
        className="hero-booking-panel"
        id="hero-booking-panel"
        role="tabpanel"
        aria-labelledby={`hero-tab-${tab}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (tab === "academy") {
            startTransition(() =>
              router.push(course ? `/classes/${course.slug}` : "/academy"),
            );
            return;
          }
          if (!serviceId || !date || loading) return;
          const slot = choices.find((s) => String(s.startMin) === time);
          const params = new URLSearchParams({ service: serviceId, date });
          if (slot) {
            params.set("barber", String(slot.barberId));
            params.set("time", String(slot.startMin));
          } else if (barberId) params.set("barber", barberId);
          startTransition(() => router.push(`/booking?${params}`));
        }}
      >
        <div className="hero-booking-grid">
          {tab === "services" ? (
            <>
              <BookingField label="خدمت" icon="scissors">
                <select
                  name="service"
                  aria-label="انتخاب خدمت"
                  required
                  value={serviceId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setServiceId(id);
                    setTime("");
                    if (
                      barberId &&
                      !barbers
                        .find((b) => b.id === Number(barberId))
                        ?.serviceIds.includes(Number(id))
                    )
                      setBarberId("");
                  }}
                >
                  <option value="" disabled>
                    انتخاب خدمت
                  </option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </BookingField>
              <BookingField label="آرایشگر" icon="user">
                <select
                  name="barber"
                  aria-label="انتخاب آرایشگر"
                  value={barberId}
                  onChange={(e) => {
                    setBarberId(e.target.value);
                    setTime("");
                  }}
                >
                  <option value="">همه آرایشگران</option>
                  {eligible.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </BookingField>
              <BookingField label="تاریخ" icon="calendar">
                <select
                  name="date"
                  aria-label="انتخاب تاریخ"
                  required
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setTime("");
                  }}
                >
                  <option value="" disabled>
                    انتخاب تاریخ
                  </option>
                  {dates.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </BookingField>
              <BookingField label="ساعت" icon="clock">
                <select
                  name="time"
                  aria-label="انتخاب ساعت"
                  value={time}
                  disabled={!ready || loading || Boolean(error)}
                  onChange={(e) => setTime(e.target.value)}
                >
                  <option value="">
                    {loading
                      ? "بررسی ساعت‌ها…"
                      : ready && !choices.length && !error
                        ? "زمان آزادی نیست"
                        : "انتخاب ساعت"}
                  </option>
                  {choices.map((s) => (
                    <option key={s.startMin} value={s.startMin}>
                      {minutesToLabel(s.startMin)}
                    </option>
                  ))}
                </select>
              </BookingField>
            </>
          ) : (
            <>
              <BookingField label="دوره" icon="cap">
                <select
                  aria-label="انتخاب دوره"
                  value={courseSlug}
                  onChange={(e) => setCourseSlug(e.target.value)}
                >
                  <option value="">انتخاب دوره</option>
                  {courses.map((c) => (
                    <option value={c.slug} key={c.slug}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </BookingField>
              <BookingField label="مدرس" icon="user">
                <input
                  aria-label="مدرس دوره"
                  readOnly
                  value={course?.instructor ?? "مدرسان آکادمی"}
                />
              </BookingField>
              <BookingField label="تاریخ شروع" icon="calendar">
                <input
                  aria-label="تاریخ شروع دوره"
                  readOnly
                  value={
                    course
                      ? formatPersianDate(course.startsOn)
                      : "با انتخاب دوره"
                  }
                />
              </BookingField>
              <BookingField label="ظرفیت" icon="users">
                <input
                  aria-label="ظرفیت دوره"
                  readOnly
                  value={
                    course
                      ? course.available > 0
                        ? `${course.available.toLocaleString("fa-IR")} صندلی آزاد`
                        : "ظرفیت تکمیل"
                      : "کلاس‌های حضوری"
                  }
                />
              </BookingField>
            </>
          )}
          <button
            type="submit"
            className="hero-reserve-button"
            disabled={pending || (tab === "services" && loading)}
          >
            <span>
              {pending
                ? "لطفاً صبر کنید…"
                : tab === "services"
                  ? "رزرو نوبت"
                  : "مشاهده دوره"}
            </span>
            <Icon name="arrow" />
          </button>
        </div>
        {tab === "services" && error && (
          <p className="hero-booking-message" role="alert">
            {error}
            <button type="button" onClick={() => setRetry((r) => r + 1)}>
              تلاش مجدد
            </button>
          </p>
        )}
        {tab === "services" &&
          ready &&
          !loading &&
          !error &&
          !choices.length && (
            <p className="hero-booking-message" role="status">
              برای این روز نوبتی آزاد نیست؛ تاریخ دیگری انتخاب کنید یا نوبت‌های
              روزهای بعد را در صفحه رزرو ببینید.
            </p>
          )}
      </form>
    </div>
  );
}
