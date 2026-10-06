"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui-cards";
import { formatPersianDate, formatPrice, minutesToLabel } from "@/lib/time";
import type { CalendarDay, VisitPlanOption, VisitPlanStart, VisitPreference } from "./plan-client";
import type { BookingBarberItem, BookingServiceItem } from "./types";

/**
 * Presentational steps of the booking flow.
 *
 * All scheduling decisions are made by the visit planner on the server; these
 * components only show what is possible and collect one decision at a time:
 * which services → which preference → which of the valid plans → confirm.
 */

const BADGE_LABELS: Record<string, string> = {
  EARLIEST: "زودترین",
  ONE_BARBER: "یک آرایشگر",
  TEAM: "تیم آرایشگران",
  NO_WAIT: "بدون انتظار",
  PREFERRED_BARBER: "آرایشگر ترجیحی",
};

export type StepShellProps = {
  id: string;
  title: string;
  description?: string;
  headingRef?: React.Ref<HTMLHeadingElement>;
  children: React.ReactNode;
};

export function StepShell({ id, title, description, headingRef, children }: StepShellProps) {
  return (
    <section aria-labelledby={id} className="text-[#1f2e27]">
      <div className="ui-pagehead">
        <h1 id={id} ref={headingRef} tabIndex={-1} className="focus:outline-none">
          {title}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * 1. Services
 * ------------------------------------------------------------------ */

export function ServiceStep({
  services,
  selectedIds,
  onToggle,
  onContinue,
  summary,
  headingRef,
}: {
  services: BookingServiceItem[];
  selectedIds: number[];
  onToggle: (serviceId: number) => void;
  onContinue: () => void;
  summary: { count: number; durationMin: number; price: number };
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const [query, setQuery] = useState("");
  const showSearch = services.length > 8;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const grouped = useMemo(() => {
    const normalized = query.trim().replace(/ي/g, "ی").replace(/ك/g, "ک");
    const filtered = normalized
      ? services.filter((service) => `${service.name} ${service.description}`.includes(normalized))
      : services;
    const map = new Map<string, BookingServiceItem[]>();
    for (const service of filtered) {
      const key = service.category || "خدمات";
      map.set(key, [...(map.get(key) ?? []), service]);
    }
    return [...map.entries()];
  }, [services, query]);

  return (
    <StepShell
      id="booking-services-title"
      headingRef={headingRef}
      title="چه خدمتی می‌خواهید؟"
      description="هر تعداد خدمت لازم دارید انتخاب کنید؛ ترتیب و آرایشگر را سالن هماهنگ می‌کند."
    >
      {showSearch && (
        <div className="relative mb-4">
          <Icon name="search" className="pointer-events-none absolute right-4 top-3.5 h-5 w-5 text-[#59636b]" />
          <label className="sr-only" htmlFor="booking-service-search">
            جست‌وجوی خدمت
          </label>
          <input
            id="booking-service-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجو بین خدمات"
            className="ui-input pr-11"
          />
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([category, items]) => (
          <div key={category}>
            <h2 className="mb-2 px-1 text-xs font-bold text-[#3f5548]">{category}</h2>
            <ul className="space-y-2.5">
              {items.map((service) => {
                const isSelected = selected.has(service.id);
                return (
                  <li key={service.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onToggle(service.id)}
                      className={`focus-ring flex w-full items-center gap-3 rounded-[20px] border bg-white p-3.5 text-right transition-colors sm:p-4 ${
                        isSelected ? "border-[#0f5a3b] bg-[#f2f9f5]" : "border-[#e5e0d4] hover:border-[#c9d6cd]"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-black ${
                          isSelected ? "border-[#0f5a3b] bg-[#0f5a3b] text-white" : "border-[#c5cdca]"
                        }`}
                      >
                        {isSelected ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-[15px] font-bold">{service.name}</strong>
                        {service.description && (
                          <span className="mt-0.5 block truncate text-xs text-[#59636b]">{service.description}</span>
                        )}
                        <span className="mt-1 block text-xs font-semibold text-[#3f5548] tabular-nums">
                          {service.durationMin.toLocaleString("fa-IR")} دقیقه · {formatPrice(service.basePrice)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="ui-panel text-sm text-[#59636b]">خدمتی مطابق جست‌وجو پیدا نشد؛ عبارت دیگری وارد کنید.</p>
        )}
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[#e5e0d4] bg-white/95 p-3 backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto w-full max-w-[720px]">
          {summary.count > 0 && (
            <p aria-live="polite" className="mb-2 text-center text-xs font-semibold text-[#3f5548] tabular-nums sm:text-right">
              {summary.count.toLocaleString("fa-IR")} خدمت · حدود {summary.durationMin.toLocaleString("fa-IR")} دقیقه ·{" "}
              {formatPrice(summary.price)}
            </p>
          )}
          <button type="button" onClick={onContinue} disabled={summary.count === 0} className="ui-button w-full">
            {summary.count === 0 ? "یک یا چند خدمت انتخاب کنید" : "ادامه"}
          </button>
        </div>
      </div>
    </StepShell>
  );
}

/* ------------------------------------------------------------------ *
 * 2. Reservation preference
 * ------------------------------------------------------------------ */

const PREFERENCES: { id: VisitPreference; title: string; caption: string; icon: "clock" | "user" | "star" }[] = [
  { id: "EARLIEST", title: "زودترین زمان", caption: "هر آرایشگر آزادی که این خدمات را کامل انجام دهد", icon: "clock" },
  { id: "ONE_BARBER", title: "ترجیحاً یک آرایشگر", caption: "اگر ممکن است همهٔ خدمات با یک نفر انجام شود", icon: "user" },
  { id: "PREFERRED_BARBER", title: "آرایشگر خاص", caption: "اولویت با آرایشگری که انتخاب می‌کنید", icon: "star" },
];

export function PreferenceStep({
  preference,
  onPreferenceChange,
  barbers,
  selectedServiceIds,
  preferredBarberId,
  onBarberChange,
  onlyPreferredBarber,
  onOnlyPreferredChange,
  onContinue,
  headingRef,
}: {
  preference: VisitPreference;
  onPreferenceChange: (preference: VisitPreference) => void;
  barbers: BookingBarberItem[];
  selectedServiceIds: number[];
  preferredBarberId: number | null;
  onBarberChange: (barberId: number | null) => void;
  onlyPreferredBarber: boolean;
  onOnlyPreferredChange: (value: boolean) => void;
  onContinue: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const coverage = (barber: BookingBarberItem) =>
    selectedServiceIds.filter((id) => barber.serviceIds.includes(id)).length;

  return (
    <StepShell
      id="booking-preference-title"
      headingRef={headingRef}
      title="چطور زمان‌بندی شود؟"
      description="این انتخاب فقط اولویت است؛ سیستم خودش آرایشگرها و ترتیب خدمات را هماهنگ می‌کند."
    >
      <fieldset>
        <legend className="sr-only">ترجیح رزرو</legend>
        <div className="space-y-2.5">
          {PREFERENCES.map((item) => {
            const isActive = preference === item.id;
            return (
              <label
                key={item.id}
                className={`flex cursor-pointer items-start gap-3 rounded-[20px] border bg-white p-4 transition-colors ${
                  isActive ? "border-[#0f5a3b] bg-[#f2f9f5]" : "border-[#e5e0d4] hover:border-[#c9d6cd]"
                }`}
              >
                <input
                  type="radio"
                  name="booking-preference"
                  value={item.id}
                  checked={isActive}
                  onChange={() => onPreferenceChange(item.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    isActive ? "border-[#0f5a3b] bg-[#0f5a3b] text-white" : "border-[#c5cdca]"
                  }`}
                >
                  {isActive ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[15px] font-bold">
                    <Icon name={item.icon} className="h-4 w-4 text-[#0f5a3b]" />
                    {item.title}
                  </span>
                  <span className="mt-1 block text-xs leading-6 text-[#59636b]">{item.caption}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {preference === "PREFERRED_BARBER" && (
        <div className="mt-4 rounded-[20px] border border-[#e5e0d4] bg-white p-4">
          <h2 className="text-sm font-bold">آرایشگر مورد نظر</h2>
          <p className="mt-1 text-xs leading-6 text-[#59636b]">
            اگر این آرایشگر بخشی از خدمات را انجام ندهد، بقیهٔ نوبت را آرایشگر واجد شرایط دیگری کامل می‌کند.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {barbers.map((barber) => {
              const coverageCount = coverage(barber);
              const isSelected = preferredBarberId === barber.id;
              return (
                <li key={barber.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onBarberChange(isSelected ? null : barber.id)}
                    className={`focus-ring flex w-full items-center gap-3 rounded-2xl border p-3 text-right transition-colors ${
                      isSelected ? "border-[#0f5a3b] bg-[#f2f9f5]" : "border-[#e5e0d4] hover:border-[#c9d6cd]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e3f0e9] text-sm font-black text-[#14432f]"
                    >
                      {barber.name.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{barber.name}</strong>
                      <span className="mt-0.5 block text-xs text-[#59636b] tabular-nums">
                        {coverageCount === selectedServiceIds.length
                          ? "همهٔ خدمت‌های انتخابی"
                          : `${coverageCount.toLocaleString("fa-IR")} از ${selectedServiceIds.length.toLocaleString("fa-IR")} خدمت`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {preferredBarberId && (
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={onlyPreferredBarber}
                onChange={(event) => onOnlyPreferredChange(event.target.checked)}
                className="focus-ring mt-1 h-4 w-4 rounded"
              />
              <span>
                فقط با این آرایشگر
                <span className="mt-0.5 block text-xs leading-6 text-[#59636b]">
                  اگر همهٔ خدمات ممکن نباشد، زمانی پیشنهاد نمی‌شود.
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[#e5e0d4] bg-white/95 p-3 backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0">
        <button
          type="button"
          onClick={onContinue}
          disabled={preference === "PREFERRED_BARBER" && !preferredBarberId}
          className="ui-button mx-auto w-full max-w-[720px]"
        >
          {preference === "PREFERRED_BARBER" && !preferredBarberId ? "یک آرایشگر انتخاب کنید" : "دیدن زمان‌های ممکن"}
        </button>
      </div>
    </StepShell>
  );
}

/* ------------------------------------------------------------------ *
 * 3. Smart calendar + valid plans
 * ------------------------------------------------------------------ */

function dayLabel(date: string, today: string): string {
  if (date === today) return "امروز";
  return new Intl.DateTimeFormat("fa-IR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function dayNumber(date: string): string {
  return new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function availabilityLabel(day: CalendarDay): string {
  if (day.planCount === 0) return "بدون زمان";
  if (day.optionCount > 1) return `${day.optionCount.toLocaleString("fa-IR")} گزینه`;
  return `${day.startCount.toLocaleString("fa-IR")} زمان`;
}

export function ScheduleStep({
  calendar,
  calendarLoading,
  calendarError,
  onRetryCalendar,
  date,
  onDateChange,
  today,
  maxDate,
  plans,
  plansLoading,
  plansError,
  onRetryPlans,
  onSelectStart,
  explanation,
  customDate,
  onCustomDateChange,
  headingRef,
  selectedServicesSummary,
}: {
  calendar: CalendarDay[] | null;
  calendarLoading: boolean;
  calendarError: string | null;
  onRetryCalendar: () => void;
  date: string;
  onDateChange: (date: string) => void;
  today: string;
  maxDate: string;
  plans: VisitPlanOption[] | null;
  plansLoading: boolean;
  plansError: string | null;
  onRetryPlans: () => void;
  onSelectStart: (option: VisitPlanOption, start: VisitPlanStart) => void;
  explanation: { reason: string; message: string } | null;
  customDate: string | null;
  onCustomDateChange: (date: string | null) => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
  selectedServicesSummary: string;
}) {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const customInput = useRef<HTMLInputElement>(null);
  const days = useMemo(() => calendar ?? [], [calendar]);
  const strip = useMemo(() => {
    const values = days.map((day) => day.date);
    if (customDate && !values.includes(customDate)) return [...values, customDate].sort();
    return values;
  }, [days, customDate]);

  return (
    <StepShell
      id="booking-schedule-title"
      headingRef={headingRef}
      title="کِی وقت دارید؟"
      description={`${selectedServicesSummary} — فقط روزهایی که این خدمات کامل انجام می‌شود نشان داده شده‌اند.`}
    >
      {calendarLoading && (
        <div role="status" aria-label="در حال بررسی تقویم" className="space-y-2">
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-24 rounded-2xl" />
        </div>
      )}

      {!calendarLoading && calendarError && (
        <div role="alert" className="ui-panel text-sm text-[#9f3b4c]">
          <p>{calendarError}</p>
          <button type="button" className="ui-button ui-button-quiet mt-3" onClick={onRetryCalendar}>
            تلاش دوباره
          </button>
        </div>
      )}

      {!calendarLoading && !calendarError && (
        <>
          {strip.length === 0 ? (
            <p className="ui-panel text-sm leading-7 text-[#59636b]">
              در سه هفتهٔ آینده زمان مناسبی برای این ترکیب خدمات پیدا نشد. می‌توانید خدمت‌ها را کم کنید یا با پذیرش تماس
              بگیرید.
            </p>
          ) : (
            <div role="group" aria-label="انتخاب تاریخ" className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
              {strip.map((value) => {
                const day = days.find((item) => item.date === value);
                const isActive = value === date;
                const disabled = day ? day.planCount === 0 : false;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isActive}
                    disabled={disabled}
                    onClick={() => onDateChange(value)}
                    className={`focus-ring flex min-h-[74px] min-w-[84px] shrink-0 flex-col items-center justify-center rounded-2xl border px-2 text-center transition-colors ${
                      isActive
                        ? "border-[#0f5a3b] bg-[#0f5a3b] text-white"
                        : disabled
                          ? "cursor-not-allowed border-[#edece8] bg-[#f6f5f1] text-[#59636b]"
                          : "border-[#e5e0d4] bg-white hover:border-[#c9d6cd]"
                    }`}
                  >
                    <span className="text-[11px] font-bold">{dayLabel(value, today)}</span>
                    <strong className="mt-0.5 text-[13px] font-bold">{dayNumber(value)}</strong>
                    <span className={`mt-0.5 text-[10px] ${isActive ? "text-white/85" : "text-[#59636b]"}`}>
                      {day ? availabilityLabel(day) : "بررسی نشده"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#59636b]" aria-live="polite">
              {plans && plans.length > 0
                ? `${formatPersianDate(date)}`
                : `${formatPersianDate(date)} · گزینه‌ای برای نمایش نیست`}
            </p>
            <div className="flex items-center gap-2">
              {customDate && (
                <button
                  type="button"
                  onClick={() => {
                    onCustomDateChange(null);
                    setShowCustomPicker(false);
                  }}
                  className="focus-ring min-h-11 text-xs font-bold text-[#14432f]"
                >
                  بازگشت به پیشنهادها
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowCustomPicker((value) => !value);
                  requestAnimationFrame(() => customInput.current?.focus());
                }}
                className="focus-ring min-h-11 text-xs font-bold text-[#14432f]"
              >
                انتخاب تاریخ دلخواه
              </button>
            </div>
          </div>

          {showCustomPicker && (
            <div className="mt-2 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e5e0d4] bg-white p-3">
              <div>
                <label htmlFor="booking-custom-date" className="ui-label">
                  تاریخ دلخواه
                </label>
                <input
                  ref={customInput}
                  id="booking-custom-date"
                  type="date"
                  dir="ltr"
                  min={today}
                  max={maxDate}
                  defaultValue={customDate ?? date}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) return;
                    onCustomDateChange(value);
                    onDateChange(value);
                    setShowCustomPicker(false);
                  }}
                  className="ui-input mt-1"
                />
              </div>
              <p className="text-xs leading-6 text-[#59636b]">تا ۶۰ روز آینده؛ اگر آن روز ظرفیت نداشته باشد پیام می‌دهیم.</p>
            </div>
          )}

          <h2 className="mb-3 mt-6 text-lg font-black">زمان‌های قابل رزرو</h2>

          {plansLoading && (
            <div role="status" aria-label="در حال محاسبهٔ زمان‌ها" className="space-y-3">
              {[1, 2, 3].map((index) => (
                <div key={index} className="skeleton h-24 rounded-2xl" />
              ))}
            </div>
          )}

          {!plansLoading && plansError && (
            <div role="alert" className="ui-panel text-sm text-[#9f3b4c]">
              <p>{plansError}</p>
              <button type="button" className="ui-button ui-button-quiet mt-3" onClick={onRetryPlans}>
                تلاش دوباره
              </button>
            </div>
          )}

          {!plansLoading && !plansError && plans && plans.length === 0 && (
            <div className="ui-panel text-sm leading-7 text-[#59636b]">
              <p className="font-bold text-[#1f2e27]">{explanation?.message ?? "برای این روز زمان مناسبی وجود ندارد."}</p>
              <ul className="mt-3 space-y-1.5">
                <li>• روز دیگری را از نوار بالا انتخاب کنید.</li>
                <li>• اگر خدمتی لازم نیست، آن را بردارید.</li>
                <li>• می‌توانید آرایشگر ترجیحی را بردارید تا گزینه‌های بیشتری باز شود.</li>
              </ul>
            </div>
          )}

          {!plansLoading && !plansError && plans && plans.length > 0 && (
            <>
              <ul className="space-y-3">
                {plans.map((option) => (
                  <PlanCard key={option.key} option={option} onSelectStart={onSelectStart} />
                ))}
              </ul>
              <p className="mt-4 text-xs leading-6 text-[#59636b]">
                هر گزینه یک نوبت کامل است، حتی وقتی دو آرایشگر روی آن کار می‌کنند؛ شما فقط یک زمان می‌گیرید و پرداخت یک
                بار انجام می‌شود.
              </p>
            </>
          )}
        </>
      )}
    </StepShell>
  );
}

function PlanCard({
  option,
  onSelectStart,
}: {
  option: VisitPlanOption;
  onSelectStart: (option: VisitPlanOption, start: VisitPlanStart) => void;
}) {
  return (
    <li className="ui-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {option.badges
              .filter((badge) => BADGE_LABELS[badge])
              .map((badge) => (
                <Badge key={badge} tone={badge === "EARLIEST" ? "brand" : badge === "TEAM" ? "neutral" : "success"}>
                  {BADGE_LABELS[badge]}
                </Badge>
              ))}
          </div>
          <p className="mt-2 text-sm font-bold">
            {option.oneBarber
              ? `با ${option.barberNames[0]}`
              : `با ${option.barberNames.join(" + ")}`}
          </p>
          <p className="mt-0.5 text-xs text-[#59636b] tabular-nums">
            {option.durationMin.toLocaleString("fa-IR")} دقیقه
            {option.handoffs > 0 ? ` · ${option.handoffs.toLocaleString("fa-IR")} جابه‌جایی بین آرایشگران` : " · بدون وقفه"}
            {" · "}
            {formatPrice(option.price)}
          </p>
        </div>
        {option.amountDueOnline > 0 && (
          <span className="rounded-full bg-[#f7f0d8] px-2.5 py-1 text-[11px] font-bold text-[#6b5213]">
            بیعانه {formatPrice(option.amountDueOnline)}
          </span>
        )}
      </div>

      <div role="group" aria-label="انتخاب ساعت شروع" className="mt-3 flex flex-wrap gap-2">
        {option.starts.map((start) => (
          <button
            key={start.startMin}
            type="button"
            onClick={() => onSelectStart(option, start)}
            className="focus-ring min-h-12 rounded-xl border border-[#d7dbd8] bg-[#f6f5f1] px-3 text-sm font-bold tabular-nums transition-colors hover:border-[#0f5a3b] hover:bg-white"
          >
            {minutesToLabel(start.startMin)}
            <span className="mx-1 text-[#59636b]">تا</span>
            {minutesToLabel(start.endMin)}
          </button>
        ))}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * 4. Review
 * ------------------------------------------------------------------ */

export function ReviewStep({
  option,
  start,
  date,
  address,
  paymentNote,
  onEdit,
  headingRef,
  holdLeft,
  busy,
  ctaLabel,
  onSubmit,
}: {
  option: VisitPlanOption;
  start: VisitPlanStart;
  date: string;
  address: string;
  paymentNote: string;
  onEdit: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
  holdLeft: number | null;
  busy: boolean;
  ctaLabel: string;
  onSubmit: () => void;
}) {
  return (
    <StepShell id="booking-review-title" headingRef={headingRef} title="بازبینی و ثبت نوبت">
      <div className="ui-panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#3f5548]">{formatPersianDate(date)}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">
              {minutesToLabel(start.startMin)}
              <span className="mx-2 text-base font-bold text-[#59636b]">تا</span>
              {minutesToLabel(start.endMin)}
            </p>
          </div>
          <p className="text-xs text-[#59636b] tabular-nums">
            {(start.endMin - start.startMin).toLocaleString("fa-IR")} دقیقه · {option.barberNames.join(" + ")}
          </p>
        </div>

        <h2 className="mt-5 text-sm font-bold">ترتیب خدمات</h2>
        <ol className="mt-2 space-y-2">
          {start.steps.map((step, index) => (
            <li
              key={`${step.serviceId}-${step.startMin}-${index}`}
              className="flex items-center gap-3 rounded-2xl bg-[#f6f5f1] p-3 text-sm"
            >
              <span className="w-[104px] shrink-0 font-bold tabular-nums" dir="ltr">
                {minutesToLabel(step.startMin)}–{minutesToLabel(step.endMin)}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {step.serviceName}
                {step.processingMin > 0 && (
                  <span className="ms-2 text-[11px] font-normal text-[#59636b]">
                    شامل {step.processingMin.toLocaleString("fa-IR")} دقیقه پردازش
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-[#59636b]">{step.barberName}</span>
            </li>
          ))}
        </ol>

        <dl className="mt-5 space-y-2 border-t border-[#e5e0d4] pt-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[#59636b]">مبلغ خدمات</dt>
            <dd className="font-bold tabular-nums">{formatPrice(option.price)}</dd>
          </div>
          {option.amountDueOnline > 0 && (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[#59636b]">پرداخت آنلاین برای قطعی‌شدن</dt>
              <dd className="font-bold tabular-nums text-[#6b5213]">{formatPrice(option.amountDueOnline)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[#59636b]">مانده در سالن</dt>
            <dd className="font-bold tabular-nums">{formatPrice(option.remainingDue)}</dd>
          </div>
        </dl>

        <p className="mt-3 text-xs leading-6 text-[#59636b]">{paymentNote}</p>
        <p className="mt-2 flex items-start gap-2 text-xs leading-6 text-[#59636b]">
          <Icon name="location" className="mt-0.5 h-4 w-4 shrink-0 text-[#0f5a3b]" />
          {address}
        </p>

        {holdLeft !== null && holdLeft > 0 && (
          <p role="status" className="mt-4 rounded-2xl bg-[#e3f0e9] p-3 text-sm font-semibold text-[#14432f]">
            این زمان موقتاً برای شما نگه داشته شده است ·{" "}
            <span dir="ltr" className="font-mono tabular-nums">
              {String(Math.floor(holdLeft / 60)).padStart(2, "0")}:{String(holdLeft % 60).padStart(2, "0")}
            </span>
          </p>
        )}
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-[#e5e0d4] bg-white/95 p-3 backdrop-blur sm:static sm:mt-6 sm:flex-row-reverse sm:border-0 sm:bg-transparent sm:p-0">
        <button type="button" onClick={onSubmit} disabled={busy} className="ui-button w-full sm:max-w-[420px]">
          {busy ? "در حال بررسی…" : ctaLabel}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="focus-ring ui-button ui-button-quiet w-full sm:w-auto"
        >
          تغییر زمان یا خدمات
        </button>
      </div>
    </StepShell>
  );
}

export function BookingSuccess({
  date,
  option,
  start,
  amountDueOnline,
  remainingDue,
  paymentMode,
  onCalendar,
  onNewBooking,
}: {
  date: string;
  option: VisitPlanOption;
  start: VisitPlanStart;
  amountDueOnline: number;
  remainingDue: number;
  paymentMode: "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT";
  onCalendar: () => void;
  onNewBooking: () => void;
}) {
  return (
    <section aria-labelledby="booking-done-title" className="text-[#1f2e27]">
      <div className="ui-panel">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e3f0e9] text-[#14432f]"
          >
            <Icon name="check" className="h-6 w-6" weight="strong" />
          </span>
          <div>
            <h1 id="booking-done-title" className="text-xl font-black">
              {paymentMode === "NO_PAYMENT" ? "نوبت شما ثبت شد" : "نوبت شما رزرو شد"}
            </h1>
            <p className="mt-0.5 text-sm text-[#59636b]">{formatPersianDate(date)}</p>
          </div>
        </div>

        <p className="mt-4 text-2xl font-black tabular-nums">
          {minutesToLabel(start.startMin)}
          <span className="mx-2 text-base font-bold text-[#59636b]">تا</span>
          {minutesToLabel(start.endMin)}
        </p>
        <p className="mt-1 text-sm font-semibold">{option.barberNames.join(" + ")}</p>

        <ol className="mt-4 space-y-2">
          {start.steps.map((step, index) => (
            <li key={`${step.serviceId}-${index}`} className="flex items-center gap-3 text-sm">
              <span className="w-[104px] shrink-0 font-bold tabular-nums" dir="ltr">
                {minutesToLabel(step.startMin)}–{minutesToLabel(step.endMin)}
              </span>
              <span className="min-w-0 flex-1 truncate">{step.serviceName}</span>
              <span className="shrink-0 text-xs text-[#59636b]">{step.barberName}</span>
            </li>
          ))}
        </ol>

        {amountDueOnline > 0 && (
          <p className="mt-4 rounded-2xl bg-[#f7f0d8] p-3 text-sm font-semibold text-[#6b5213]">
            {formatPrice(amountDueOnline)} پرداخت آنلاین · {formatPrice(remainingDue)} در سالن
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
          <a className="ui-button w-full sm:w-auto" href="/account">
            مشاهده در پنل من
          </a>
          <button type="button" onClick={onCalendar} className="ui-button ui-button-quiet w-full sm:w-auto">
            افزودن به تقویم
          </button>
          <button type="button" onClick={onNewBooking} className="focus-ring min-h-11 text-sm font-bold text-[#14432f]">
            رزرو جدید
          </button>
        </div>
        <p className="mt-4 text-xs leading-6 text-[#59636b]">
          تا ۲۴ ساعت قبل می‌توانید از «پنل من» نوبت را لغو کنید. برای تغییر زمان با پذیرش تماس بگیرید.
        </p>
      </div>
    </section>
  );
}
