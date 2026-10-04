"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import type { Slot } from "@/lib/availability";
import { useToast } from "@/components/toast";
import { buildAppointmentIcs, downloadIcs } from "@/lib/ics";
import { CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL } from "@/lib/site";
import {
  addDaysISO,
  formatPersianDate,
  formatPrice,
  minutesToLabel,
  todayISO,
} from "@/lib/time";

export type BookingService = {
  id: number;
  slug?: string;
  name: string;
  durationMin: number;
  basePrice: number;
  description: string;
  paymentMode?: "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT";
  depositAmount?: number;
  category?: string;
};

export type BookingBarber = {
  id: number;
  slug?: string;
  name: string;
  title: string;
  serviceIds: number[];
};

const CANCELLATION_POLICY =
  "لغو یا تغییر نوبت تا ۲۴ ساعت قبل از زمان انتخابی بدون کسر وجه امکان‌پذیر است. در صورت عدم حضور، بیعانه بازگردانده نمی‌شود.";

const nextSlotSchema = z.object({ date: z.string(), startMin: z.number() });
const availabilitySchema = z.object({
  mode: z.enum(["ANY", "BARBER"]).optional(),
  service: z
    .object({
      id: z.number(),
      name: z.string(),
      price: z.number(),
      durationMin: z.number(),
      paymentMode: z.enum(["NO_PAYMENT", "DEPOSIT", "FULL_PAYMENT"]),
      depositAmount: z.number(),
      amountDueOnline: z.number(),
      remainingDue: z.number(),
    })
    .optional(),
  slots: z
    .array(
      z.object({
        startMin: z.number(),
        endMin: z.number(),
        state: z.enum(["AVAILABLE", "BOOKED", "CLOSED"]),
        label: z.string(),
      }),
    )
    .optional(),
  next: nextSlotSchema.nullable().optional(),
  suggestion: nextSlotSchema
    .extend({ barberId: z.number(), name: z.string() })
    .nullable()
    .optional(),
  error: z.string().optional(),
});
const receiptSchema = z.object({
  appointmentId: z.number().int().positive().optional(),
  paymentReference: z.string().nullable().optional(),
  amountDueOnline: z.number().optional(),
  remainingDue: z.number().optional(),
  paymentMode: z.enum(["NO_PAYMENT", "DEPOSIT", "FULL_PAYMENT"]).optional(),
  error: z.string().optional(),
});
type AvailabilityResponse = z.infer<typeof availabilitySchema>;
type PaymentMode = NonNullable<BookingService["paymentMode"]>;

const PHONE_RE = /^09\d{9}$/;
const STEPS = [
  { id: "service", label: "خدمت" },
  { id: "barber", label: "آرایشگر" },
  { id: "date", label: "تاریخ" },
  { id: "time", label: "زمان" },
  { id: "review", label: "بازبینی و ثبت" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const GROUPS = [
  { id: "morning", label: "صبح", from: 0, to: 720, icon: "☀" },
  { id: "noon", label: "ظهر", from: 720, to: 900, icon: "☀" },
  { id: "evening", label: "عصر", from: 900, to: 1140, icon: "◐" },
  { id: "night", label: "شب", from: 1140, to: 1440, icon: "☾" },
];

function normalizePhone(value: string): string {
  return value
    .replace(/[۰-۹]/g, (n) => String(n.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (n) => String(n.charCodeAt(0) - 1632));
}

function Stepper({
  current,
  furthest,
  onJump,
}: {
  current: StepId;
  furthest: number;
  onJump: (index: number) => void;
}) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <nav
      aria-label="مراحل رزرو"
      className="rounded-2xl border border-brass-400/25 bg-white p-3 shadow-sm"
    >
      <ol className="hide-scrollbar flex items-center gap-1 overflow-x-auto">
        {STEPS.map((step, i) => {
          const state =
            i < currentIndex ? "done" : i === currentIndex ? "active" : "todo";
          const reachable = i <= furthest;
          return (
            <li key={step.id} className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={!reachable}
                aria-current={state === "active" ? "step" : undefined}
                onClick={() => onJump(i)}
                className={`focus-ring flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:cursor-default ${
                  state === "active"
                    ? "bg-brand-700 text-white shadow-sm"
                    : state === "done"
                      ? "bg-brass-400/20 text-brass-600"
                      : "text-bone/55"
                }`}
              >
                <span aria-hidden="true" className="font-mono text-[11px]">
                  {state === "done" ? "✓" : i + 1}
                </span>
                {step.label}
                {state === "done" && <span className="sr-only">تکمیل شده</span>}
              </button>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="h-px w-3 bg-brass-400/30 sm:w-6"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function BookingFlow({
  servicesList,
  barbersList,
  initialBarberId,
  initialServiceId,
  initialDate,
  initialStartMin,
  staffMode = false,
}: {
  servicesList: BookingService[];
  barbersList: BookingBarber[];
  initialBarberId?: number;
  initialServiceId?: number;
  initialDate?: string;
  initialStartMin?: number;
  staffMode?: boolean;
}) {
  const toast = useToast();
  const [serviceId, setServiceId] = useState(
    initialServiceId ?? servicesList[0]?.id ?? 0,
  );
  const [barberId, setBarberId] = useState<number | "ANY">(
    initialBarberId ?? "ANY",
  );
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [category, setCategory] = useState<string>("ALL");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [next, setNext] = useState<{ date: string; startMin: number } | null>(
    null,
  );
  const [suggestion, setSuggestion] =
    useState<AvailabilityResponse["suggestion"]>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [quote, setQuote] = useState<{
    key: string;
    price: number;
    durationMin: number;
    paymentMode: PaymentMode;
    depositAmount: number;
    amountDueOnline: number;
    remainingDue: number;
  } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<"tickets" | "grid">("grid");
  const [stepIndex, setStepIndex] = useState(() => {
    if (initialStartMin !== undefined && initialBarberId !== undefined)
      return 4;
    if (initialBarberId !== undefined) return 3;
    if (initialServiceId !== undefined) return 1;
    return 0;
  });
  const [done, setDone] = useState<{
    id: number;
    reference: string | null;
    date: string;
    startMin: number;
    durationMin: number;
    serviceName: string;
    barberName: string;
    amountDueOnline: number;
    remainingDue: number;
    paymentMode: PaymentMode;
  } | null>(null);
  const appliedInitialTime = useRef(false);
  const requestCount = useRef(0);
  const selectionKey = `${barberId}:${serviceId}:${date}`;
  const loading = loadedKey !== selectionKey;

  const eligibleBarbers = useMemo(
    () => barbersList.filter((b) => b.serviceIds.includes(serviceId)),
    [barbersList, serviceId],
  );
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const s of servicesList) if (s.category) seen.add(s.category);
    return ["ALL", ...Array.from(seen)];
  }, [servicesList]);
  const visibleServices = useMemo(
    () =>
      category === "ALL"
        ? servicesList
        : servicesList.filter((s) => s.category === category),
    [servicesList, category],
  );
  const baseService = servicesList.find((s) => s.id === serviceId);
  const service =
    baseService && quote?.key === selectionKey
      ? {
          ...baseService,
          basePrice: quote.price,
          durationMin: quote.durationMin,
          paymentMode: quote.paymentMode,
          depositAmount: quote.depositAmount,
        }
      : baseService;
  const money = service && quote?.key === selectionKey ? quote : null;
  const currentBarber = barbersList.find((b) => b.id === barberId);
  const dates = useMemo(() => {
    const values = Array.from({ length: 14 }, (_, i) =>
      addDaysISO(todayISO(), i),
    );
    if (initialDate && !values.includes(initialDate)) values.push(initialDate);
    return values.sort();
  }, [initialDate]);
  const freeCount = slots.filter((s) => s.state === "AVAILABLE").length;
  const availableSlotsList = useMemo(
    () => slots.filter((s) => s.state === "AVAILABLE"),
    [slots],
  );

  const furthest = useMemo(() => {
    let index = 0;
    if (serviceId) index = 1;
    if (serviceId && barberId !== "ANY") index = 2;
    if (serviceId && barberId !== "ANY" && date) index = 3;
    if (serviceId && barberId !== "ANY" && selected !== null) index = 4;
    return index;
  }, [serviceId, barberId, date, selected]);

  const step: StepId = STEPS[Math.min(stepIndex, furthest)].id;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!serviceId) return;
      const request = ++requestCount.current;
      const params = new URLSearchParams({
        serviceId: String(serviceId),
        date,
      });
      if (barberId !== "ANY") params.set("barberId", String(barberId));
      try {
        const res = await fetch(`/api/availability?${params}`, {
          signal,
          cache: "no-store",
        });
        const data = availabilitySchema.parse(await res.json());
        if (signal?.aborted || request !== requestCount.current) return;
        if (!res.ok) throw new Error(data.error ?? "خطا در دریافت زمان‌ها");
        if (data.mode === "ANY") {
          setSlots([]);
          setSuggestion(data.suggestion ?? null);
          setNext(null);
          setQuote(null);
        } else {
          const freshSlots = data.slots ?? [];
          setSlots(freshSlots);
          setNext(data.next ?? null);
          setSuggestion(null);
          if (data.service)
            setQuote({
              key: selectionKey,
              price: data.service.price,
              durationMin: data.service.durationMin,
              paymentMode: data.service.paymentMode,
              depositAmount: data.service.depositAmount,
              amountDueOnline: data.service.amountDueOnline,
              remainingDue: data.service.remainingDue,
            });
          if (!appliedInitialTime.current && initialStartMin !== undefined) {
            appliedInitialTime.current = true;
            if (
              freshSlots.some(
                (s) =>
                  s.startMin === initialStartMin && s.state === "AVAILABLE",
              )
            )
              setSelected(initialStartMin);
            else
              toast.push(
                "زمان انتخابی دیگر آزاد نیست؛ نزدیک‌ترین زمان آزاد را انتخاب کنید.",
                "warning",
              );
          }
        }
      } catch (error) {
        if (!signal?.aborted && request === requestCount.current) {
          setSlots([]);
          setSuggestion(null);
          setNext(null);
          setSelected(null);
          toast.push(
            error instanceof Error
              ? error.message
              : "خطا در ارتباط با سامانه رزرو",
            "error",
          );
        }
      } finally {
        if (!signal?.aborted && request === requestCount.current)
          setLoadedKey(selectionKey);
      }
    },
    [barberId, serviceId, date, selectionKey, initialStartMin, toast],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch result applied after await, not a sync setState
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function pickService(id: number) {
    if (id === serviceId) return;
    setSelected(null);
    setServiceId(id);
    if (
      barberId !== "ANY" &&
      !barbersList.find((b) => b.id === barberId)?.serviceIds.includes(id)
    )
      setBarberId("ANY");
    setStepIndex(1);
  }

  function pickBarber(id: number | "ANY") {
    setSelected(null);
    setBarberId(id);
    if (id !== "ANY") setStepIndex(2);
  }

  /** Fast path: accept the engine's earliest suggestion and jump to review. */
  function acceptSuggestion() {
    if (!suggestion) return;
    setBarberId(suggestion.barberId);
    setDate(suggestion.date);
    setSelected(suggestion.startMin);
    setStepIndex(4);
  }

  function pickSlot(startMin: number) {
    if (
      loading ||
      !slots.some((s) => s.startMin === startMin && s.state === "AVAILABLE")
    )
      return;
    setSelected(startMin);
    setStepIndex(4);
    if (window.innerWidth < 768)
      document.getElementById("booking-info-form")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }

  function jumpTo(index: number) {
    if (index > furthest) return;
    setStepIndex(index);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (barberId === "ANY" || selected === null || loading || submitting)
      return;
    const normalizedPhone = normalizePhone(phone);
    if (!PHONE_RE.test(normalizedPhone)) {
      toast.push("شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          barberId,
          serviceId,
          date,
          startMin: selected,
          clientName: name,
          clientPhone: normalizedPhone,
          notes,
          source: staffMode ? (walkIn ? "WALK_IN" : "RECEPTION") : "ONLINE",
        }),
      });
      const data = receiptSchema.parse(await res.json());
      if (!res.ok || !data.appointmentId) {
        toast.push(data.error ?? "رزرو انجام نشد.", "error");
        setSelected(null);
        setStepIndex(3);
        setLoadedKey("");
        void load();
        return;
      }
      setDone({
        id: data.appointmentId,
        reference: data.paymentReference ?? null,
        date,
        startMin: selected,
        durationMin: service?.durationMin ?? 30,
        serviceName: service?.name ?? "",
        barberName: currentBarber?.name ?? "",
        amountDueOnline: data.amountDueOnline ?? 0,
        remainingDue: data.remainingDue ?? service?.basePrice ?? 0,
        paymentMode: data.paymentMode ?? "NO_PAYMENT",
      });
      toast.push("نوبت با موفقیت ثبت شد.", "success");
      void load();
    } catch {
      toast.push(
        "نتیجه درخواست دریافت نشد. پیش از رزرو مجدد، وضعیت نوبت را با سالن بررسی کنید.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------- Confirmation ---------------- */
  if (done) {
    const dueOnline = done.amountDueOnline;
    return (
      <div
        className="glass-card rounded-3xl p-6 md:p-8 text-center border-2 border-brass-400/40 shadow-lg"
        role="status"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-700/10 border-2 border-brand-700 text-brand-700 text-3xl font-black">
          ✓
        </div>
        <h2 className="mt-4 text-2xl font-black text-brand-700">
          نوبت شما ثبت شد
        </h2>
        <p className="mt-1 text-xs text-bone/60">
          این رسید را نگه دارید. چند دقیقه پیش از زمان انتخابی در سالن حضور
          داشته باشید.
        </p>

        <dl className="mx-auto mt-6 max-w-md space-y-2.5 rounded-2xl border border-brass-400/25 bg-white/80 p-5 text-sm">
          <div className="flex justify-between">
            <dt className="text-bone/55">کد رهگیری</dt>
            <dd className="font-mono font-black text-brand-700">{done.id}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-bone/55">خدمت</dt>
            <dd className="font-bold text-bone">{done.serviceName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-bone/55">مسترباربر</dt>
            <dd className="font-bold text-brass-600">{done.barberName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-bone/55">زمان</dt>
            <dd className="font-bold text-brand-700">
              {formatPersianDate(done.date)} — ساعت{" "}
              {minutesToLabel(done.startMin)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-brass-400/20 pt-2.5">
            <dt className="text-bone/55">وضعیت پرداخت</dt>
            <dd className="font-bold text-bone">
              {dueOnline > 0
                ? `${formatPrice(dueOnline)} برای پرداخت آنلاین`
                : "پرداخت در سالن"}
            </dd>
          </div>
          {dueOnline > 0 && done.remainingDue > 0 && (
            <div className="flex justify-between">
              <dt className="text-bone/55">مانده در سالن</dt>
              <dd className="font-bold text-brass-600">
                {formatPrice(done.remainingDue)}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
          {dueOnline > 0 && done.reference ? (
            <Link
              href={`/pay?ref=${encodeURIComponent(done.reference)}`}
              className="focus-ring inline-block rounded-full bg-brand-700 px-8 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#094028]"
            >
              پرداخت {formatPrice(dueOnline)}
            </Link>
          ) : (
            <p className="text-xs text-brand-700 font-semibold bg-brand-700/10 py-2.5 px-4 rounded-full">
              این خدمت پیش‌پرداخت ندارد؛ هزینه در سالن تسویه می‌شود.
            </p>
          )}
          <button
            type="button"
            onClick={() =>
              downloadIcs(
                `appointment-${done.id}.ics`,
                buildAppointmentIcs({
                  title: `${done.serviceName} — آکادمی زیبایی فرشید معروف پور`,
                  description: `کد رهگیری ${done.id} · مسترباربر ${done.barberName}`,
                  location: "تهران، خیابان ولیعصر، پلاک ۱۲",
                  date: done.date,
                  startMin: done.startMin,
                  durationMin: done.durationMin,
                  referenceId: done.id,
                }),
              )
            }
            className="focus-ring rounded-full border border-brass-400 bg-white px-7 py-3 text-xs font-bold text-brass-600 hover:bg-brass-400/15"
          >
            افزودن به تقویم
          </button>
          <Link
            href={`/track?q=${done.id}`}
            className="focus-ring rounded-full border border-bone/20 bg-white px-7 py-3 text-xs font-bold text-bone/70 hover:border-gold"
          >
            پیگیری نوبت
          </Link>
        </div>

        <p className="mt-6 text-[11px] text-bone/50">
          برای لغو یا تغییر نوبت با پذیرش تماس بگیرید:{" "}
          <a
            href={`tel:${CONTACT_PHONE_TEL}`}
            className="focus-ring rounded font-bold text-brand-700"
            dir="ltr"
          >
            {CONTACT_PHONE_DISPLAY}
          </a>
        </p>

        <button
          type="button"
          onClick={() => {
            setDone(null);
            setSelected(null);
            setName("");
            setPhone("");
            setNotes("");
            setStepIndex(0);
          }}
          className="focus-ring mt-6 block w-full rounded-full border border-bone/20 bg-white py-3 text-sm font-semibold text-bone/60 hover:border-gold"
        >
          رزرو نوبت جدید
        </button>
      </div>
    );
  }

  const summaryReady = serviceId && barberId !== "ANY" && selected !== null;

  return (
    <div className="space-y-6">
      <Stepper current={step} furthest={furthest} onJump={jumpTo} />

      {/* Persistent summary so the user always knows what is chosen */}
      <div className="rounded-2xl border border-brass-400/25 bg-white/80 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="text-bone/45">خدمت:</span>
            <b className="text-bone">{baseService?.name ?? "—"}</b>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-bone/45">آرایشگر:</span>
            <b className="text-brass-600">
              {currentBarber?.name ?? "انتخاب نشده"}
            </b>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-bone/45">تاریخ:</span>
            <b className="text-bone">{date ? formatPersianDate(date) : "—"}</b>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-bone/45">ساعت:</span>
            <b className="font-mono text-brand-700">
              {selected !== null ? minutesToLabel(selected) : "—"}
            </b>
          </span>
          {money && (
            <span className="flex items-center gap-1.5 ms-auto">
              <span className="text-bone/45">مبلغ:</span>
              <b className="text-brass-600">{formatPrice(money.price)}</b>
            </span>
          )}
        </div>
      </div>

      {/* ---------------- Step 1: service ---------------- */}
      {step === "service" && (
        <section
          aria-labelledby="bk-service"
          className="glass-card rounded-3xl p-5 md:p-7 border border-brass-400/25 shadow-sm"
        >
          <h2 id="bk-service" className="text-lg font-black text-bone">
            چه خدمتی می‌خواهید؟
          </h2>
          <p className="mt-1 text-xs text-bone/55">
            مدت زمان و مبلغ هر خدمت پیش از انتخاب نمایش داده می‌شود.
          </p>

          {categories.length > 2 && (
            <div
              role="group"
              aria-label="فیلتر دسته خدمات"
              className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1"
            >
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className={`focus-ring shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${
                    category === c
                      ? "border-brand-700 bg-brand-700 text-white"
                      : "border-brass-400/30 bg-white text-bone/65 hover:border-brass-400"
                  }`}
                >
                  {c === "ALL" ? "همه" : c}
                </button>
              ))}
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="service-options">
            {visibleServices.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === serviceId}
                aria-label={s.name}
                onClick={() => pickService(s.id)}
                className={`focus-ring rounded-2xl border p-4 text-right transition ${
                  s.id === serviceId
                    ? "border-brand-700 bg-brand-700/10 shadow-sm ring-2 ring-brand-700/30"
                    : "border-brass-400/25 bg-white hover:border-brass-400"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-bone">{s.name}</span>
                  {s.category && (
                    <span className="rounded-full bg-brass-400/15 px-2 py-0.5 text-[10px] font-bold text-brass-600">
                      {s.category}
                    </span>
                  )}
                </div>
                <span className="mt-2 block text-xs font-semibold text-brass-600">
                  {s.durationMin} دقیقه · {formatPrice(s.basePrice)}
                </span>
                <span className="mt-1 block text-[11px] leading-6 text-bone/55 line-clamp-2">
                  {s.description}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- Step 2: barber ---------------- */}
      {step === "barber" && (
        <section
          aria-labelledby="bk-barber"
          className="glass-card rounded-3xl p-5 md:p-7 border border-brass-400/25 shadow-sm"
        >
          <h2 id="bk-barber" className="text-lg font-black text-bone">
            مسترباربر خود را انتخاب کنید
          </h2>
          <p className="mt-1 text-xs text-bone/55">
            تنها آرایشگرانی نمایش داده می‌شوند که این خدمت را ارائه می‌دهند.
          </p>

          <div className="mt-5 space-y-3">
            <button
              type="button"
              aria-pressed={barberId === "ANY"}
              onClick={() => pickBarber("ANY")}
              className={`focus-ring w-full rounded-2xl border-2 p-4 text-right transition ${
                barberId === "ANY"
                  ? "border-brand-700 bg-brand-700/10"
                  : "border-brass-400/30 bg-white hover:border-brass-400"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-black text-bone">⚡ اولین وقت آزاد</p>
                  <p className="mt-1 text-xs text-bone/60">
                    سیستم سریع‌ترین زمان ممکن را برای شما پیدا می‌کند.
                  </p>
                </div>
                {barberId === "ANY" && (
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-700" />
                )}
              </div>
              {barberId === "ANY" && !loading && suggestion && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3">
                  <p className="text-xs text-bone/70">
                    نزدیک‌ترین زمان:{" "}
                    <b className="text-brand-700">{suggestion.name}</b> —{" "}
                    {formatPersianDate(suggestion.date)} ساعت{" "}
                    {minutesToLabel(suggestion.startMin)}
                  </p>
                  <button
                    type="button"
                    onClick={acceptSuggestion}
                    className="focus-ring rounded-full bg-brand-700 px-5 py-2 text-xs font-bold text-white"
                  >
                    ادامه با این زمان ←
                  </button>
                </div>
              )}
            </button>

            {eligibleBarbers.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={barberId === b.id}
                onClick={() => pickBarber(b.id)}
                className={`focus-ring w-full rounded-2xl border-2 p-4 text-right transition ${
                  barberId === b.id
                    ? "border-brand-700 bg-brand-700/10"
                    : "border-brass-400/25 bg-white hover:border-brass-400"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-brass-400 bg-white font-black text-brand-700"
                    >
                      {b.name.slice(0, 1)}
                    </span>
                    <div>
                      <p className="font-bold text-bone">{b.name}</p>
                      <p className="text-[11px] text-brass-600">{b.title}</p>
                    </div>
                  </div>
                  {barberId === b.id && (
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-700" />
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-brass-400/20 pt-4">
            <button
              type="button"
              onClick={() => setStepIndex(0)}
              className="focus-ring rounded-full border border-bone/20 bg-white px-5 py-2 text-xs font-bold text-bone/65 hover:border-gold"
            >
              → بازگشت به خدمات
            </button>
            <button
              type="button"
              disabled={barberId === "ANY"}
              onClick={() => setStepIndex(2)}
              className="focus-ring rounded-full bg-brand-700 px-7 py-2.5 text-xs font-bold text-white shadow-sm disabled:bg-bone/15 disabled:text-bone/40"
            >
              ادامه ←
            </button>
          </div>
        </section>
      )}

      {/* ---------------- Step 3: date ---------------- */}
      {step === "date" && (
        <section
          aria-labelledby="bk-date"
          className="glass-card rounded-3xl p-5 md:p-7 border border-brass-400/25 shadow-sm"
        >
          <h2 id="bk-date" className="text-lg font-black text-bone">
            روز مراجعه را انتخاب کنید
          </h2>
          <p className="mt-1 text-xs text-bone/55">
            نوبت‌ها تا ۱۴ روز آینده قابل رزرو هستند. روزهای گذشته غیرفعال هستند.
          </p>

          <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7">
            {dates.map((d) => {
              const isSelected = d === date;
              const isToday = d === todayISO();
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelected(null);
                    setDate(d);
                  }}
                  className={`focus-ring flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-3 transition ${
                    isSelected
                      ? "border-brand-700 bg-brand-700 text-white shadow-sm"
                      : "border-brass-400/25 bg-white text-bone/70 hover:border-brass-400"
                  }`}
                >
                  <span
                    className={`text-[11px] font-bold ${isSelected ? "text-[#f7e7c4]" : "text-brass-600"}`}
                  >
                    {new Intl.DateTimeFormat("fa-IR", {
                      weekday: "long",
                      timeZone: "UTC",
                    }).format(new Date(`${d}T00:00:00Z`))}
                  </span>
                  <span className="text-sm font-black">
                    {new Intl.DateTimeFormat("fa-IR", {
                      day: "numeric",
                      month: "long",
                      timeZone: "UTC",
                    }).format(new Date(`${d}T00:00:00Z`))}
                  </span>
                  {isToday && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-brand-700/10 text-brand-700"
                      }`}
                    >
                      امروز
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-brass-400/20 pt-4">
            <button
              type="button"
              onClick={() => setStepIndex(1)}
              className="focus-ring rounded-full border border-bone/20 bg-white px-5 py-2 text-xs font-bold text-bone/65 hover:border-gold"
            >
              → بازگشت به آرایشگر
            </button>
            <button
              type="button"
              onClick={() => setStepIndex(3)}
              className="focus-ring rounded-full bg-brand-700 px-7 py-2.5 text-xs font-bold text-white shadow-sm"
            >
              مشاهده ساعت‌ها ←
            </button>
          </div>
        </section>
      )}

      {/* ---------------- Step 4: time ---------------- */}
      {step === "time" && (
        <section aria-labelledby="bk-time" aria-busy={loading}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="bk-time" className="text-lg font-black text-bone">
                ساعت مورد نظر را انتخاب کنید
              </h2>
              <p className="mt-1 text-xs text-bone/55">
                {formatPersianDate(date)} · {currentBarber?.name} ·{" "}
                {service?.name}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-brass-400/30 bg-white p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("tickets")}
                className={`rounded-full px-3 py-1 font-bold transition ${
                  viewMode === "tickets"
                    ? "bg-brand-700 text-white"
                    : "text-bone/60"
                }`}
              >
                نمای کارت
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`rounded-full px-3 py-1 font-bold transition ${
                  viewMode === "grid"
                    ? "bg-brand-700 text-white"
                    : "text-bone/60"
                }`}
              >
                شبکه ساعت‌ها
              </button>
            </div>
          </div>

          {loading ? (
            <div
              className="mt-5 space-y-3"
              role="status"
              aria-label="در حال استعلام نوبت‌ها"
            >
              <div className="skeleton h-4 w-32 rounded" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton h-24 rounded-2xl" />
                ))}
              </div>
            </div>
          ) : viewMode === "tickets" ? (
            <div className="mt-5 space-y-3">
              {availableSlotsList.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-brass-400/30 bg-white p-6 text-center text-sm text-bone/60">
                  {next
                    ? `در این روز نوبت آزادی نمانده است. اولین زمان آزاد: ${formatPersianDate(next.date)} ساعت ${minutesToLabel(next.startMin)}`
                    : "در این روز نوبت آزادی وجود ندارد."}
                  {next && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(null);
                        setDate(next.date);
                      }}
                      className="focus-ring mt-3 block w-full rounded-full bg-brand-700 px-5 py-2 text-xs font-bold text-white"
                    >
                      رفتن به {formatPersianDate(next.date)}
                    </button>
                  )}
                </div>
              ) : (
                availableSlotsList.map((slot) => {
                  const isChosen = selected === slot.startMin;
                  return (
                    <article
                      key={slot.startMin}
                      className={`rounded-3xl border-2 bg-white p-4 shadow-sm transition ${
                        isChosen
                          ? "border-brand-700 ring-2 ring-brand-700/30"
                          : "border-brass-400/30"
                      }`}
                    >
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-center">
                        <div className="rounded-2xl border border-brass-400/15 bg-[#fcfaf5] p-3 sm:col-span-5">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="block text-[10px] text-bone/50">
                                شروع
                              </span>
                              <span className="font-mono text-2xl font-black text-brand-700">
                                {minutesToLabel(slot.startMin)}
                              </span>
                            </div>
                            <div className="px-3 text-center">
                              <span className="block text-[10px] font-bold text-brass-600">
                                {service?.durationMin} دقیقه
                              </span>
                              <span aria-hidden="true" className="text-xs">
                                ✂️
                              </span>
                            </div>
                            <div className="text-left">
                              <span className="block text-[10px] text-bone/50">
                                پایان
                              </span>
                              <span className="font-mono text-2xl font-black text-bone">
                                {minutesToLabel(slot.endMin)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="sm:col-span-4">
                          <p className="text-sm font-bold text-bone">
                            {currentBarber?.name}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-brand-700">
                            <span>✓ مشاوره پیش از اصلاح</span>
                            <span className="text-bone/55">✓ ابزار استریل</span>
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t border-brass-400/20 pt-3 sm:col-span-3 sm:justify-end sm:border-t-0 sm:pt-0">
                          <span className="text-sm font-black text-brass-600">
                            {service ? formatPrice(service.basePrice) : "—"}
                          </span>
                          <button
                            type="button"
                            onClick={() => pickSlot(slot.startMin)}
                            className={`focus-ring rounded-full px-5 py-2.5 text-xs font-black transition ${
                              isChosen
                                ? "bg-brand-700 text-white ring-2 ring-brass-400"
                                : "border border-brand-700/30 bg-brand-700/10 text-brand-700 hover:bg-brand-700 hover:text-white"
                            }`}
                          >
                            {isChosen ? "✓ انتخاب شد" : "انتخاب ←"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {GROUPS.map((g) => {
                const groupSlots = slots.filter(
                  (s) => s.startMin >= g.from && s.startMin < g.to,
                );
                if (groupSlots.length === 0) return null;
                return (
                  <div
                    key={g.id}
                    className="rounded-2xl border border-brass-400/20 bg-white p-4"
                  >
                    <p className="flex items-center gap-1.5 text-xs font-bold text-brass-600">
                      <span aria-hidden="true">{g.icon}</span>
                      {g.label}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                      {groupSlots.map((s) => {
                        const disabled = s.state !== "AVAILABLE";
                        const isChosen = selected === s.startMin;
                        return (
                          <button
                            key={s.startMin}
                            type="button"
                            disabled={disabled}
                            aria-pressed={isChosen}
                            onClick={() => pickSlot(s.startMin)}
                            className={`focus-ring rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                              isChosen
                                ? "border-brand-700 bg-brand-700 font-bold text-white"
                                : disabled
                                  ? "cursor-not-allowed border-dashed border-brass-400/20 bg-[#f4f1e8]/50 text-bone/35"
                                  : "border-brand-700/35 bg-white text-brand-700 hover:border-brass-400 hover:bg-brass-400/10"
                            }`}
                          >
                            <span className="block font-mono text-sm">
                              {minutesToLabel(s.startMin)}
                            </span>
                            <span className="block text-[10px] opacity-75">
                              {s.state === "AVAILABLE"
                                ? "✓ آزاد"
                                : s.state === "BOOKED"
                                  ? "× رزرو"
                                  : "— بسته"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {freeCount === 0 && (
                <div className="rounded-2xl border border-brass-400/30 bg-white p-4 text-sm text-bone/70">
                  {next
                    ? `در این روز زمان آزادی نیست. اولین زمان آزاد: ${formatPersianDate(next.date)} ساعت ${minutesToLabel(next.startMin)}`
                    : "در این روز زمان آزادی وجود ندارد."}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-brass-400/20 pt-4">
            <button
              type="button"
              onClick={() => setStepIndex(2)}
              className="focus-ring rounded-full border border-bone/20 bg-white px-5 py-2 text-xs font-bold text-bone/65 hover:border-gold"
            >
              → بازگشت به تاریخ
            </button>
            <button
              type="button"
              disabled={selected === null}
              onClick={() => setStepIndex(4)}
              className="focus-ring rounded-full bg-brand-700 px-7 py-2.5 text-xs font-bold text-white shadow-sm disabled:bg-bone/15 disabled:text-bone/40"
            >
              بازبینی و ثبت ←
            </button>
          </div>
        </section>
      )}

      {/* ---------------- Step 5: review & submit ---------------- */}
      {step === "review" && (
        <form
          id="booking-info-form"
          onSubmit={submit}
          className="glass-card rounded-3xl p-5 md:p-8 border-2 border-brass-400/35 shadow-sm scroll-mt-24"
        >
          <h2 className="text-lg font-black text-bone">بازبینی و ثبت نهایی</h2>
          <p className="mt-1 text-xs text-bone/55">
            پیش از ثبت، جزئیات نوبت و شرایط پرداخت را بررسی کنید.
          </p>

          {/* Timeline summary */}
          <ol className="mt-5 space-y-3">
            <li className="flex items-center gap-3 rounded-2xl border border-brass-400/20 bg-white p-4">
              <span className="font-mono text-lg font-black text-brand-700">
                {selected !== null ? minutesToLabel(selected) : "--:--"}
              </span>
              <span aria-hidden="true" className="h-8 w-px bg-brass-400/30" />
              <div className="min-w-0">
                <p className="font-bold text-bone">{service?.name}</p>
                <p className="text-[11px] text-bone/55">
                  {currentBarber?.name} · {service?.durationMin} دقیقه ·{" "}
                  {formatPersianDate(date)}
                </p>
              </div>
            </li>
          </ol>

          {/* Price breakdown */}
          {money && (
            <dl className="mt-5 divide-y divide-brass-400/15 rounded-2xl border border-brass-400/25 bg-white/80 p-4 text-sm">
              <div className="flex justify-between py-2">
                <dt className="text-bone/55">مبلغ خدمت</dt>
                <dd className="font-bold text-bone">
                  {formatPrice(money.price)}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-bone/55">
                  {money.paymentMode === "DEPOSIT"
                    ? "بیعانه آنلاین"
                    : money.paymentMode === "FULL_PAYMENT"
                      ? "پرداخت کامل آنلاین"
                      : "پرداخت آنلاین"}
                </dt>
                <dd className="font-bold text-brand-700">
                  {formatPrice(money.amountDueOnline)}
                </dd>
              </div>
              {money.remainingDue > 0 && (
                <div className="flex justify-between py-2">
                  <dt className="text-bone/55">مانده تا روز نوبت (در سالن)</dt>
                  <dd className="font-bold text-brass-600">
                    {formatPrice(money.remainingDue)}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <p className="mt-4 rounded-2xl border border-brass-400/25 bg-brass-400/10 p-3.5 text-[11px] leading-6 text-[#6b5326]">
            <b className="block text-brass-600">شرایط لغو و تغییر نوبت</b>
            {CANCELLATION_POLICY}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="bk-name"
                className="text-xs font-semibold text-bone/70"
              >
                نام و نام خانوادگی
              </label>
              <input
                id="bk-name"
                required
                minLength={2}
                value={name}
                placeholder="مثال: کیان مهرابی"
                onChange={(e) => setName(e.target.value)}
                className="focus-ring mt-2 w-full rounded-2xl border border-brass-400/30 bg-white px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="bk-phone"
                className="text-xs font-semibold text-bone/70"
              >
                شماره موبایل (برای پیامک تأیید و پیگیری)
              </label>
              <input
                id="bk-phone"
                required
                inputMode="numeric"
                dir="ltr"
                placeholder="09121234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="focus-ring mt-2 w-full rounded-2xl border border-brass-400/30 bg-white px-4 py-3 text-sm font-mono"
              />
            </div>
          </div>

          <div className="mt-4">
            <label
              htmlFor="bk-notes"
              className="text-xs font-semibold text-bone/70"
            >
              توضیح برای آرایشگر (اختیاری)
            </label>
            <textarea
              id="bk-notes"
              rows={3}
              maxLength={300}
              value={notes}
              placeholder="مثال: موی کم‌حجم، لطفاً خط کنار را تمیز بزنید."
              onChange={(e) => setNotes(e.target.value)}
              className="focus-ring mt-2 w-full rounded-2xl border border-brass-400/30 bg-white px-4 py-3 text-sm"
            />
          </div>

          {staffMode && (
            <label className="mt-4 flex items-center gap-2 text-xs text-bone/70">
              <input
                type="checkbox"
                checked={walkIn}
                onChange={(e) => setWalkIn(e.target.checked)}
                className="focus-ring h-4 w-4 rounded text-brand-700"
              />
              مراجعه حضوری (Walk-in) — وضعیت بلافاصله «حاضر شد» ثبت شود
            </label>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setStepIndex(3)}
              className="focus-ring rounded-full border border-bone/20 bg-white px-5 py-3 text-xs font-bold text-bone/65 hover:border-gold"
            >
              → بازگشت و تغییر ساعت
            </button>
            <button
              type="submit"
              disabled={submitting || loading || selected === null}
              className="focus-ring w-full rounded-full bg-brand-700 py-4 text-sm font-black text-white shadow-md transition hover:bg-[#094028] disabled:cursor-not-allowed disabled:bg-bone/15 disabled:text-bone/40 sm:w-auto sm:px-10"
            >
              {submitting ? "در حال ثبت نوبت…" : "تأیید و ثبت نوبت"}
            </button>
          </div>
          {selected === null && (
            <p className="mt-3 text-center text-xs text-bone/50">
              برای ثبت نوبت، یک ساعت آزاد انتخاب کنید.
            </p>
          )}
        </form>
      )}

      {/* Mobile sticky summary */}
      {summaryReady && (
        <div className="fixed inset-x-0 bottom-16 z-30 p-3 sm:hidden">
          <div className="glass-floating flex items-center justify-between gap-3 rounded-2xl border border-brass-400/40 p-3 shadow-lg">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold text-brand-700">
                {minutesToLabel(selected as number)} · {service?.name}
              </p>
              <p className="text-[10px] font-semibold text-brass-600">
                {money ? formatPrice(money.price) : ""}
                {money &&
                money.amountDueOnline > 0 &&
                money.amountDueOnline < money.price
                  ? ` · بیعانه ${formatPrice(money.amountDueOnline)}`
                  : ""}
              </p>
            </div>
            {step !== "review" ? (
              <a
                href="#booking-info-form"
                className="shrink-0 rounded-full bg-brand-700 px-4 py-2 text-xs font-bold text-white shadow"
              >
                تکمیل ثبت ↓
              </a>
            ) : (
              <span className="shrink-0 rounded-full bg-brand-700/10 px-3 py-1.5 text-[11px] font-bold text-brand-700">
                آماده ثبت
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
