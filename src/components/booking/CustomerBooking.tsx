"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { BookingAuthModal, type AuthUser } from "@/components/booking/BookingAuthModal";
import { BookingPolicySheet } from "@/components/booking/BookingPolicySheet";
import {
  BookingSuccess,
  PreferenceStep,
  ReviewStep,
  ScheduleStep,
  ServiceStep,
} from "@/components/booking/BookingSteps";
import {
  fetchCalendar,
  fetchPlans,
  invalidatePlanCache,
  type CalendarDay,
  type VisitPlanOption,
  type VisitPlanStart,
} from "@/components/booking/plan-client";
import type { BookingBarberItem, BookingServiceItem, VisitPreference } from "@/components/booking/types";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { buildAppointmentIcs, downloadIcs } from "@/lib/ics";
import { CONTACT_ADDRESS } from "@/lib/site";
import { addDaysISO, formatPrice, todayISO } from "@/lib/time";

export type { BookingBarberItem, BookingServiceItem } from "@/components/booking/types";

/**
 * Customer booking flow.
 *
 * Four screens, one decision each:
 *   1. services          (multi-select, one CTA)
 *   2. reservation preference (earliest / prefer one barber / specific barber)
 *   3. smart calendar + valid booking plans (complete visits only)
 *   4. review — then auth, hold and creation happen in one go
 *
 * The scheduler decides the hard parts (which barber, in what order, whether the
 * chain fits); the customer only chooses what and when.
 */

type Step = "services" | "preference" | "schedule" | "review" | "done";

const holdSchema = z.object({ expiresAt: z.string(), error: z.string().optional() });
const groupReceiptSchema = z.object({
  appointmentIds: z.array(z.number().int().positive()).min(1),
  bookingGroupId: z.string().optional(),
  paymentReference: z.string().nullable(),
  amountDueOnline: z.number(),
  remainingDue: z.number(),
});

export function CustomerBooking({
  servicesList,
  barbersList,
  initialUser,
  initialServiceIds = [],
  initialBarberId,
  initialPreference,
  initialDate,
  initialStartMin,
  policyVersion,
  policyItems,
  demoPhoneHint,
}: {
  servicesList: BookingServiceItem[];
  barbersList: BookingBarberItem[];
  initialUser: AuthUser | null;
  initialServiceIds?: number[];
  initialBarberId?: number;
  initialPreference?: VisitPreference;
  initialDate?: string;
  initialStartMin?: number;
  policyVersion: string;
  policyItems: string[];
  demoPhoneHint?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const today = todayISO();
  const maxDate = addDaysISO(today, 60);

  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [authOpen, setAuthOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  const [serviceIds, setServiceIds] = useState<number[]>(initialServiceIds);
  const [preference, setPreference] = useState<VisitPreference>(
    initialPreference ?? (initialBarberId ? "PREFERRED_BARBER" : "EARLIEST"),
  );
  const [preferredBarberId, setPreferredBarberId] = useState<number | null>(initialBarberId ?? null);
  const [onlyPreferredBarber, setOnlyPreferredBarber] = useState(false);
  const [date, setDate] = useState(initialDate ?? today);
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ option: VisitPlanOption; start: VisitPlanStart } | null>(null);

  const [step, setStep] = useState<Step>(() => (initialServiceIds.length ? "preference" : "services"));

  const [calendar, setCalendar] = useState<CalendarDay[] | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarNonce, setCalendarNonce] = useState(0);

  const [plans, setPlans] = useState<VisitPlanOption[] | null>(null);
  const [explanation, setExplanation] = useState<{ reason: string; message: string } | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansNonce, setPlansNonce] = useState(0);

  const [hold, setHold] = useState<{ expiry: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{
    amountDueOnline: number;
    remainingDue: number;
    paymentMode: "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT";
  } | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const serviceKey = serviceIds.join(",");

  const orderedSelection = useMemo(
    () => serviceIds.map((id) => servicesList.find((service) => service.id === id)).filter(Boolean) as BookingServiceItem[],
    [serviceIds, servicesList],
  );
  const summary = useMemo(
    () => ({
      count: orderedSelection.length,
      durationMin: orderedSelection.reduce((sum, service) => sum + service.durationMin, 0),
      price: orderedSelection.reduce((sum, service) => sum + service.basePrice, 0),
    }),
    [orderedSelection],
  );
  const serviceImportKey = `${serviceKey}|${preference}|${preferredBarberId ?? "-"}|${onlyPreferredBarber ? 1 : 0}`;

  /* ---------- focus management ---------- */
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  /* ---------- URL state: refresh keeps the visit the customer was planning ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (serviceKey) params.set("services", serviceKey);
    if (preference !== "EARLIEST") params.set("pref", preference);
    if (preferredBarberId) params.set("barber", String(preferredBarberId));
    if (onlyPreferredBarber) params.set("only", "1");
    if (date !== today) params.set("date", date);
    if (selection) params.set("time", String(selection.start.startMin));
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [serviceKey, preference, preferredBarberId, onlyPreferredBarber, date, selection, today]);

  /* ---------- load the smart calendar when the request changes ---------- */
  const loadCalendar = useCallback(
    async (signal?: AbortSignal) => {
      if (serviceIds.length === 0) {
        setCalendar([]);
        return;
      }
      setCalendarLoading(true);
      setCalendarError(null);
      try {
        const result = await fetchCalendar({
          serviceIds,
          preference,
          preferredBarberId: preference === "PREFERRED_BARBER" ? preferredBarberId : null,
          onlyPreferredBarber: preference === "PREFERRED_BARBER" && onlyPreferredBarber,
          from: today,
          days: 14,
        });
        if (signal?.aborted) return;
        setCalendar(result.window);
        // Land on the nearest valid day instead of an empty page — but never
        // override a day the customer picked deliberately.
        const selectedDay = result.window.find((day) => day.date === date);
        if (result.nearest && date === today && (!selectedDay || selectedDay.planCount === 0)) {
          setDate(result.nearest.date);
        }
      } catch (error) {
        if (signal?.aborted) return;
        setCalendar(null);
        setCalendarError(error instanceof Error ? error.message : "دریافت تقویم ممکن نشد.");
      } finally {
        if (!signal?.aborted) setCalendarLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serviceKey, preference, preferredBarberId, onlyPreferredBarber, calendarNonce, today],
  );

  useEffect(() => {
    if (step !== "schedule") return;
    const controller = new AbortController();
    // The loaders update state from their promise continuations, never during
    // the commit itself.
    void Promise.resolve().then(() => loadCalendar(controller.signal));
    return () => controller.abort();
  }, [step, loadCalendar]);

  /* ---------- load the valid plans for the selected date ---------- */
  const loadPlans = useCallback(
    async (signal?: AbortSignal) => {
      if (serviceIds.length === 0) return;
      setPlansLoading(true);
      setPlansError(null);
      try {
        const result = await fetchPlans({
          serviceIds,
          date,
          preference,
          preferredBarberId: preference === "PREFERRED_BARBER" ? preferredBarberId : null,
          onlyPreferredBarber: preference === "PREFERRED_BARBER" && onlyPreferredBarber,
        });
        if (signal?.aborted) return;
        setPlans(result.options);
        setExplanation(result.explanation);
      } catch (error) {
        if (signal?.aborted) return;
        setPlans(null);
        setExplanation(null);
        setPlansError(error instanceof Error ? error.message : "دریافت زمان‌ها ممکن نشد.");
      } finally {
        if (!signal?.aborted) setPlansLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serviceKey, date, preference, preferredBarberId, onlyPreferredBarber, plansNonce],
  );

  useEffect(() => {
    if (step !== "schedule") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => loadPlans(controller.signal));
    return () => controller.abort();
  }, [step, loadPlans]);

  /* ---------- deep link with an exact start time ---------- */
  const appliedInitialStart = useRef(false);
  useEffect(() => {
    if (appliedInitialStart.current || initialStartMin === undefined || !plans?.length) return;
    const match = plans
      .map((option) => ({ option, start: option.starts.find((start) => start.startMin === initialStartMin) }))
      .find((candidate) => candidate.start);
    if (!match?.start) return;
    appliedInitialStart.current = true;
    void Promise.resolve().then(() => {
      setSelection({ option: match.option, start: match.start! });
      setStep("review");
    });
  }, [plans, initialStartMin]);

  /* ---------- hold countdown ---------- */
  const holdExpiry = hold?.expiry;
  useEffect(() => {
    if (step !== "review" || !holdExpiry) return;
    const timer = window.setInterval(
      () =>
        setHold((previous) =>
          previous ? { ...previous, left: Math.max(0, Math.ceil((previous.expiry - Date.now()) / 1000)) } : null,
        ),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [step, holdExpiry]);

  useEffect(() => {
    if (!initialUser) return;
    let cancelled = false;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { policyAccepted?: boolean }) => {
        if (!cancelled) setPolicyAccepted(Boolean(result.policyAccepted));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  /* ---------- actions ---------- */

  function toggleService(serviceId: number) {
    setSelection(null);
    setPlans(null);
    setServiceIds((current) =>
      current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId],
    );
  }

  async function placeHold(): Promise<boolean> {
    if (!selection) return false;
    try {
      const response = await fetch("/api/booking/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: selection.start.steps.map((stepItem) => ({
            attendeeId: "primary",
            barberId: stepItem.barberId,
            serviceId: stepItem.serviceId,
            date,
            startMin: stepItem.startMin,
          })),
        }),
      });
      const json: unknown = await response.json().catch(() => null);
      const parsed = holdSchema.safeParse(json);
      const message = z.object({ error: z.string().optional() }).safeParse(json).data?.error;
      if (!response.ok || !parsed.success) throw new Error(message ?? "این زمان دیگر آزاد نیست.");
      const expiry = new Date(parsed.data.expiresAt).getTime();
      setHold({ expiry, left: Math.max(0, Math.ceil((expiry - Date.now()) / 1000)) });
      return true;
    } catch (error) {
      await recoverFromConflict(error instanceof Error ? error.message : "نگهداری زمان انجام نشد.");
      return false;
    }
  }

  /** Slot taken by someone else: keep the selections, refresh the options. */
  async function recoverFromConflict(message: string) {
    toast.push(message, "error");
    invalidatePlanCache();
    setHold(null);
    setSelection(null);
    setStep("schedule");
    setPlansNonce((value) => value + 1);
    setCalendarNonce((value) => value + 1);
  }

  async function submit() {
    if (!selection || busy) return;
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!policyAccepted) {
      setPolicyOpen(true);
      return;
    }
    setBusy(true);
    try {
      if (!hold || (hold.left ?? 0) < 1) {
        const held = await placeHold();
        if (!held) return;
      }
      const response = await fetch("/api/appointments/group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: selection.start.steps.map((stepItem) => ({
            attendeeId: "primary",
            attendeeName: user.name,
            barberId: stepItem.barberId,
            serviceId: stepItem.serviceId,
            date,
            startMin: stepItem.startMin,
          })),
        }),
      });
      const json: unknown = await response.json().catch(() => null);
      const parsed = groupReceiptSchema.safeParse(json);
      const message = z.object({ error: z.string().optional() }).safeParse(json).data?.error;
      if (!response.ok || !parsed.success) {
        const conflict = message ?? "ثبت نوبت انجام نشد.";
        if (/رزرو شد|آزاد نیست|مهلت/.test(conflict)) {
          await recoverFromConflict(conflict);
          return;
        }
        throw new Error(conflict);
      }

      invalidatePlanCache();
      setReceipt({
        amountDueOnline: parsed.data.amountDueOnline,
        remainingDue: parsed.data.remainingDue,
        paymentMode:
          parsed.data.amountDueOnline > 0
            ? selection.option.paymentMode === "FULL_PAYMENT"
              ? "FULL_PAYMENT"
              : "DEPOSIT"
            : "NO_PAYMENT",
      });
      setHold(null);
      setStep("done");
      toast.push("نوبت شما ثبت شد.", "success");
      router.refresh();

      if (parsed.data.paymentReference) {
        router.push(`/pay?ref=${encodeURIComponent(parsed.data.paymentReference)}`);
      }
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "ثبت نوبت انجام نشد.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleAuthenticated(signedIn: AuthUser) {
    setUser(signedIn);
    setAuthOpen(false);
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const result: { policyAccepted?: boolean } = await response.json();
      if (!response.ok) throw new Error("وضعیت قوانین رزرو دریافت نشد. دوباره تلاش کنید.");
      const accepted = Boolean(result.policyAccepted);
      setPolicyAccepted(accepted);
      if (accepted) await placeHold();
      else setPolicyOpen(true);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "ادامه رزرو ممکن نشد.", "error");
    }
  }

  /* ---------- derived copy ---------- */
  const paymentNote = useMemo(() => {
    if (!selection) return "";
    if (selection.option.amountDueOnline > 0)
      return "برای قطعی‌شدن نوبت، پرداخت آنلاین لازم است. مبلغ نهایی در سرور دوباره بررسی می‌شود.";
    return "پرداخت در سالن انجام می‌شود. زمان انتخابی پس از ثبت برای شما قطعی می‌شود.";
  }, [selection]);

  const ctaLabel = !user
    ? "ورود / ساخت حساب و ثبت نوبت"
    : selection && selection.option.amountDueOnline > 0
      ? `ثبت و پرداخت ${formatPrice(selection.option.amountDueOnline)}`
      : "تأیید و ثبت نوبت";

  if (step === "done" && selection && receipt) {
    return (
      <div className="mx-auto max-w-[720px] px-4 pb-24 pt-5 sm:px-6 sm:pt-9">
        <BookingSuccess
          date={date}
          option={selection.option}
          start={selection.start}
          amountDueOnline={receipt.amountDueOnline}
          remainingDue={receipt.remainingDue}
          paymentMode={receipt.paymentMode}
          onCalendar={() =>
            downloadIcs(
              `visit-${date}.ics`,
              buildAppointmentIcs({
                title: `نوبت، آکادمی زیبایی فرشید معروف پور`,
                description: selection.start.steps
                  .map((stepItem) => `${stepItem.serviceName} — ${stepItem.barberName}`)
                  .join(" · "),
                location: CONTACT_ADDRESS,
                date,
                startMin: selection.start.startMin,
                durationMin: selection.start.endMin - selection.start.startMin,
                referenceId: `${date}-${selection.start.startMin}`,
              }),
            )
          }
          onNewBooking={() => {
            setSelection(null);
            setHold(null);
            setReceipt(null);
            setStep("services");
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 pb-32 pt-5 text-[#1f2e27] sm:px-6 sm:pb-24 sm:pt-9">
      <BookingAuthModal
        isOpen={authOpen && !user}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={(signedIn) => void handleAuthenticated(signedIn)}
        demoPhoneHint={demoPhoneHint}
      />
      <BookingPolicySheet
        isOpen={policyOpen}
        onClose={() => setPolicyOpen(false)}
        onAccept={async () => {
          setPolicyAccepted(true);
          setPolicyOpen(false);
          if (user) await placeHold();
        }}
        version={policyVersion}
        items={policyItems}
      />

      <header className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (step === "services") router.push("/home");
            else if (step === "preference") setStep("services");
            else if (step === "schedule") setStep("preference");
            else setStep("schedule");
          }}
          className="focus-ring flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-[#14432f]"
        >
          <Icon name="arrow" className="h-4 w-4" />
          بازگشت
        </button>
        <ol aria-label="مراحل رزرو" className="flex items-center gap-1.5">
          {(["services", "preference", "schedule", "review"] as Step[]).map((item, index) => {
            const currentIndex = ["services", "preference", "schedule", "review"].indexOf(step);
            const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "todo";
            return (
              <li key={item} aria-current={state === "active" ? "step" : undefined}>
                <span
                  className={`block h-1.5 rounded-full transition-[width,background-color] duration-150 ${
                    state === "active" ? "w-7 bg-[#0f5a3b]" : state === "done" ? "w-3.5 bg-[#7fc9a6]" : "w-3.5 bg-[#d7dbd8]"
                  }`}
                />
                <span className="sr-only">
                  {item === "services"
                    ? "خدمت‌ها"
                    : item === "preference"
                      ? "ترجیح رزرو"
                      : item === "schedule"
                        ? "تاریخ و زمان"
                        : "بازبینی"}
                </span>
              </li>
            );
          })}
        </ol>
        <Link
          href="/home"
          aria-label="بستن رزرو"
          className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg"
        >
          <Icon name="close" className="h-5 w-5" />
        </Link>
      </header>

      {serviceIds.length > 0 && step !== "services" && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[#e5e0d4] bg-white p-3 text-sm">
          <Icon name="scissors" className="h-5 w-5 shrink-0 text-[#14432f]" />
          <strong className="min-w-0 flex-1 truncate">{orderedSelection.map((service) => service.name).join(" + ")}</strong>
          <span className="shrink-0 text-xs text-[#59636b] tabular-nums">
            {summary.count.toLocaleString("fa-IR")} خدمت · {summary.durationMin.toLocaleString("fa-IR")} دقیقه
          </span>
          <button
            type="button"
            onClick={() => setStep("services")}
            className="focus-ring min-h-11 shrink-0 text-xs font-bold text-[#14432f]"
          >
            تغییر
          </button>
        </div>
      )}

      {step === "services" && (
        <ServiceStep
          services={servicesList}
          selectedIds={serviceIds}
          onToggle={toggleService}
          onContinue={() => setStep("preference")}
          summary={summary}
          headingRef={headingRef}
        />
      )}

      {step === "preference" && (
        <PreferenceStep
          preference={preference}
          onPreferenceChange={(value) => {
            setPreference(value);
            setSelection(null);
            setPlans(null);
          }}
          barbers={barbersList}
          selectedServiceIds={serviceIds}
          preferredBarberId={preferredBarberId}
          onBarberChange={(value) => {
            setPreferredBarberId(value);
            setSelection(null);
            setPlans(null);
          }}
          onlyPreferredBarber={onlyPreferredBarber}
          onOnlyPreferredChange={(value) => {
            setOnlyPreferredBarber(value);
            setSelection(null);
            setPlans(null);
          }}
          onContinue={() => {
            setCustomDate(null);
            setStep("schedule");
          }}
          headingRef={headingRef}
        />
      )}

      {step === "schedule" && (
        <ScheduleStep
          key={serviceImportKey}
          calendar={calendar}
          calendarLoading={calendarLoading}
          calendarError={calendarError}
          onRetryCalendar={() => setCalendarNonce((value) => value + 1)}
          date={date}
          onDateChange={(value) => {
            setDate(value);
            setSelection(null);
          }}
          today={today}
          maxDate={maxDate}
          plans={plans}
          plansLoading={plansLoading}
          plansError={plansError}
          onRetryPlans={() => setPlansNonce((value) => value + 1)}
          onSelectStart={(option, start) => {
            setSelection({ option, start });
            setHold(null);
            setStep("review");
          }}
          explanation={explanation}
          customDate={customDate}
          onCustomDateChange={(value) => {
            setCustomDate(value);
            if (value) setDate(value);
          }}
          headingRef={headingRef}
          selectedServicesSummary={`${summary.count.toLocaleString("fa-IR")} خدمت · حدود ${summary.durationMin.toLocaleString("fa-IR")} دقیقه`}
        />
      )}

      {step === "review" && selection && (
        <ReviewStep
          option={selection.option}
          start={selection.start}
          date={date}
          address={CONTACT_ADDRESS}
          paymentNote={paymentNote}
          onEdit={() => setStep("schedule")}
          headingRef={headingRef}
          holdLeft={hold?.left ?? null}
          busy={busy}
          ctaLabel={ctaLabel}
          onSubmit={() => void submit()}
        />
      )}

      {step === "review" && selection && !user && (
        <p className="mt-4 text-center text-xs leading-6 text-[#59636b]">
          برای قطعی‌کردن نوبت، شماره موبایل شما و تأیید قوانین رزرو لازم است. زمان انتخابی تا آن لحظه رزرو نمی‌شود.
        </p>
      )}

      {step === "review" && selection && selection.option.handoffs > 0 && (
        <p className="mt-4 flex items-start gap-2 text-xs leading-6 text-[#59636b]">
          <Icon name="users" className="mt-0.5 h-4 w-4 shrink-0 text-[#14432f]" />
          {selection.option.barberNames.join(" و ")} به‌ترتیب روی بخش‌های این نوبت کار می‌کنند؛ نیازی به هماهنگی شما نیست.
        </p>
      )}

    </div>
  );
}
