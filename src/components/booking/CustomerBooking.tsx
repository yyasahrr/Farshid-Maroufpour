"use client";

/**
 * Customer booking wizard — one selection, ONE start time, one visit.
 *
 * Step model (design/ux/booking-flow.md):
 *   0 services (multi-select toggles) → 1 date & start time → 2 staff plan
 *   (matching + barber filter) → 3 summary/login/policy/hold → 4 confirmation.
 * Every screen asks for exactly one decision. Per-service times no longer
 * exist: the server plans the continuous visit and this component only renders
 * its answer. Prices, staff and availability come from /api/booking/plan and
 * are re-validated again inside the booking transaction.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { BookingAuthModal, type AuthUser } from "@/components/booking/BookingAuthModal";
import { BookingPolicySheet } from "@/components/booking/BookingPolicySheet";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { buildAppointmentIcs, downloadIcs } from "@/lib/ics";
import { addDaysISO, formatPersianDate, formatPrice, minutesToLabel, todayISO } from "@/lib/time";

export type BookingServiceItem = {
  id: number;
  slug?: string;
  name: string;
  category: string;
  durationMin: number;
  basePrice: number;
  description: string;
  paymentMode: "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT";
  depositAmount: number;
};
export type BookingBarberItem = { id: number; slug?: string; name: string; title: string; serviceIds: number[] };
export type BookingCombinationRule = { a: number; b: number; canCombine: boolean; sameBarberRequired: boolean; note: string };

/* ---------- server contracts (parsed defensively — never trust raw shape) ---------- */

const segmentSchema = z.object({
  attendeeId: z.string(),
  serviceId: z.number(),
  serviceName: z.string(),
  barberId: z.number(),
  barberName: z.string(),
  barberSlug: z.string(),
  date: z.string(),
  startMin: z.number(),
  barberEndMin: z.number(),
  clientEndMin: z.number(),
  durationMin: z.number(),
  barberDurationMin: z.number(),
  bufferMin: z.number(),
  processingMin: z.number(),
  price: z.number(),
  paymentMode: z.enum(["NO_PAYMENT", "DEPOSIT", "FULL_PAYMENT"]),
  amountDueOnline: z.number(),
  remainingDue: z.number(),
  managerApprovalRequired: z.boolean(),
});
const planSchema = z.object({
  date: z.string(),
  startMin: z.number(),
  endMin: z.number(),
  totalMinutes: z.number(),
  segments: z.array(segmentSchema),
  totalPrice: z.number(),
  amountDueOnline: z.number(),
  remainingDue: z.number(),
  requiresManagerApproval: z.boolean(),
  distinctBarbers: z.number(),
});
const planResponseSchema = z.object({
  plan: planSchema.nullable(),
  validStarts: z.array(z.number()),
  nearby: z.array(z.number()),
  issues: z.array(z.object({ code: z.string(), message: z.string() })),
});
const holdResponseSchema = z.object({
  ok: z.literal(true),
  plan: planSchema,
  planId: z.string(),
  expiresAt: z.string(),
  holdDurationSec: z.number(),
});
const holdErrorSchema = z.object({ ok: z.literal(false), error: z.string(), nearby: z.array(z.number()).optional() });
const receiptSchema = z.object({
  ok: z.literal(true),
  appointmentIds: z.array(z.number().int().positive()).min(1),
  paymentReference: z.string().nullable(),
  amountDueOnline: z.number(),
  remainingDue: z.number(),
  requiresManagerApproval: z.boolean(),
  status: z.string(),
  visit: planSchema,
});

type PlanResponse = z.infer<typeof planResponseSchema>;
type VisitPlan = z.infer<typeof planSchema>;

/* ---------- helpers ---------- */

function normalizeQuery(value: string): string {
  return value.trim().replace(/ي/g, "ی").replace(/ك/g, "ک");
}

/** Persian grouping for the time grid — morning / midday / afternoon / evening. */
const DAY_PARTS = [
  { label: "صبح", from: 6 * 60, to: 12 * 60 },
  { label: "ظهر", from: 12 * 60, to: 15 * 60 },
  { label: "عصر", from: 15 * 60, to: 20 * 60 },
  { label: "شب", from: 20 * 60, to: 24 * 60 },
];

function persianNum(value: number): string {
  return value.toLocaleString("fa-IR");
}

type Companion = { id: string; name: string };
type AttendeeSelection = Record<string, number[]>;

export function CustomerBooking({
  servicesList,
  barbersList,
  combinationRules,
  initialUser,
  initialServiceId,
  initialBarberId,
  initialDate,
  initialStartMin,
  policyVersion,
  policyItems,
  demoPhoneHint,
}: {
  servicesList: BookingServiceItem[];
  barbersList: BookingBarberItem[];
  combinationRules: BookingCombinationRule[];
  initialUser: AuthUser | null;
  initialServiceId?: number;
  initialBarberId?: number;
  initialDate?: string;
  initialStartMin?: number;
  policyVersion: string;
  policyItems: string[];
  demoPhoneHint?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  /* ---- wizard state (one decision per screen) ---- */
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(
    initialServiceId ? (initialStartMin !== undefined ? 2 : 1) : 0,
  );
  const [selected, setSelected] = useState<AttendeeSelection>(() =>
    initialServiceId ? { primary: [initialServiceId] } : { primary: [] },
  );
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [activeAttendee, setActiveAttendee] = useState<string>("primary");
  const [newCompanionName, setNewCompanionName] = useState("");
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [startMin, setStartMin] = useState<number | null>(initialStartMin ?? null);
  const [barberFilter, setBarberFilter] = useState<number | null>(initialBarberId ?? null);
  const [category, setCategory] = useState("همه");
  const [search, setSearch] = useState("");
  const [showFullCalendar, setShowFullCalendar] = useState(false);

  const [user, setUser] = useState(initialUser);
  const [authOpen, setAuthOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  const [grid, setGrid] = useState<{ key: string; value: PlanResponse | null; error: string | null }>({ key: "", value: null, error: null });
  const [staffPlan, setStaffPlan] = useState<{ key: string; value: PlanResponse | null; error: string | null; stale?: boolean }>({ key: "", value: null, error: null });
  const [hold, setHold] = useState<{ plan: VisitPlan; expiry: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<z.infer<typeof receiptSchema> | null>(null);
  const requestId = useRef(0);

  const stageLabels = ["خدمت", "زمان", "آرایشگر", "بازبینی"];

  const attendeesSpec = useMemo(() => {
    const list: { attendeeId: string; serviceIds: number[]; barberId: number | null }[] = [
      { attendeeId: "primary", serviceIds: selected.primary ?? [], barberId: barberFilter },
    ];
    for (const companion of companions) {
      const ids = selected[companion.id] ?? [];
      if (ids.length > 0) list.push({ attendeeId: companion.id, serviceIds: ids, barberId: null });
    }
    return list.filter((a) => a.serviceIds.length > 0);
  }, [selected, barberFilter, companions]);

  const activeIds = selected[activeAttendee] ?? [];
  const totalMinutes = attendeesSpec.reduce((sum, a) => {
    return sum + a.serviceIds.reduce((s, id) => s + (servicesList.find((x) => x.id === id)?.durationMin ?? 0), 0);
  }, 0);
  const totalPriceFrom = attendeesSpec.reduce((sum, a) => {
    return sum + a.serviceIds.reduce((s, id) => s + (servicesList.find((x) => x.id === id)?.basePrice ?? 0), 0);
  }, 0);
  const selectionCount = attendeesSpec.reduce((sum, a) => sum + a.serviceIds.length, 0);

  const dates = useMemo(() => {
    const result = Array.from({ length: 14 }, (_, index) => addDaysISO(todayISO(), index));
    if (initialDate && !result.includes(initialDate)) result.push(initialDate);
    return result.sort();
  }, [initialDate]);

  const categories = useMemo(
    () => ["همه", ...new Set(servicesList.map((item) => item.category).filter(Boolean))],
    [servicesList],
  );
  const filteredServices = servicesList.filter(
    (item) =>
      (category === "همه" || item.category === category) &&
      normalizeQuery(`${item.name} ${item.description}`).includes(normalizeQuery(search)),
  );

  /** Which services conflict with the current toggle set, and why (mirror of server rules). */
  const conflictsFor = useCallback(
    (candidateId: number, currentIds: number[]): string | null => {
      for (const other of currentIds) {
        if (other === candidateId) continue;
        const [a, b] = candidateId < other ? [candidateId, other] : [other, candidateId];
        const rule = combinationRules.find((r) => r.a === a && r.b === b);
        if (rule && !rule.canCombine) {
          const otherName = servicesList.find((s) => s.id === other)?.name ?? `سرویس ${other}`;
          return rule.note.trim() ? `با «${otherName}» قابل ترکیب نیست — ${rule.note}` : `با «${otherName}» قابل ترکیب نیست.`;
        }
      }
      return null;
    },
    [combinationRules, servicesList],
  );

  /** Services no active barber offers at all — disabled WITH a reason, not just grey. */
  const offeredServiceIds = useMemo(() => new Set(barbersList.flatMap((b) => b.serviceIds)), [barbersList]);

  /* ---- data fetching: grid for step 1, full plan for step 2+ ---- */
  const gridKey = `grid:${JSON.stringify(attendeesSpec)}:${date}`;
  const planKey = `plan:${JSON.stringify(attendeesSpec)}:${date}:${startMin ?? "none"}`;

  useEffect(() => {
    if (step !== 1 || attendeesSpec.length === 0) return;
    const controller = new AbortController();
    const serial = ++requestId.current;
    void fetch("/api/booking/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
      body: JSON.stringify({ date, startMin: null, attendees: attendeesSpec }),
    })
      .then(async (res) => {
        const json: unknown = await res.json();
        if (!res.ok) throw new Error(z.object({ error: z.string().optional() }).safeParse(json).data?.error ?? "زمان‌های آزاد دریافت نشدند.");
        const parsed = planResponseSchema.safeParse(json);
        if (!parsed.success) throw new Error("پاسخ زمان‌بندی معتبر نیست؛ دوباره تلاش کنید.");
        if (serial === requestId.current) setGrid({ key: gridKey, value: parsed.data, error: null });
      })
      .catch((error: unknown) => {
        if (serial === requestId.current) setGrid({ key: gridKey, value: null, error: error instanceof Error ? error.message : "دریافت زمان‌ها ممکن نشد." });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step === 1, gridKey, date]);

  useEffect(() => {
    if (step !== 2 || startMin === null || attendeesSpec.length === 0) return;
    const controller = new AbortController();
    const serial = ++requestId.current;
    void fetch("/api/booking/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
      body: JSON.stringify({ date, startMin, attendees: attendeesSpec }),
    })
      .then(async (res) => {
        const json: unknown = await res.json();
        const parsed = planResponseSchema.safeParse(json);
        if (!res.ok || !parsed.success) throw new Error(
          z.object({ error: z.string().optional() }).safeParse(json).data?.error ?? "برخورد زمان با برنامه ممکن نشد؛ دوباره تلاش کنید.",
        );
        if (serial === requestId.current) {
          setStaffPlan((previous) => ({
            key: planKey,
            value: parsed.data,
            error: null,
            stale: Boolean(previous.value?.plan && !parsed.data.plan),
          }));
        }
      })
      .catch((error: unknown) => {
        if (serial === requestId.current) setStaffPlan({ key: planKey, value: null, error: error instanceof Error ? error.message : "بررسی زمان ممکن نشد." });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step === 2, planKey, date, startMin]);

  const planValue: PlanResponse | null = staffPlan.key === planKey ? staffPlan.value : null;
  const planError = staffPlan.key === planKey ? staffPlan.error : null;
  const plan = planValue?.plan ?? null;
  const planLoading = step === 2 && staffPlan.key !== planKey;

  const gridValue: PlanResponse | null = grid.key === gridKey ? grid.value : null;
  const gridError = grid.key === gridKey ? grid.error : null;
  const gridLoading = step === 1 && grid.key !== gridKey;
  const validStarts = useMemo(() => new Set(gridValue?.validStarts ?? []), [gridValue]);

  /* ---- hold timer ---- */
  const holdExpiry = hold?.expiry;
  useEffect(() => {
    if (step !== 3 || !holdExpiry) return;
    const timer = window.setInterval(
      () => setHold((previous) => (previous ? { ...previous, left: Math.max(0, Math.ceil((previous.expiry - Date.now()) / 1000)) } : null)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [step, holdExpiry]);

  /* ---- policy status on load ---- */
  useEffect(() => {
    if (!initialUser) return;
    let cancelled = false;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((result: { policyAccepted?: boolean }) => {
        if (!cancelled) setPolicyAccepted(Boolean(result.policyAccepted));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [initialUser]);

  const waitForHold = useCallback(async (): Promise<boolean> => {
    if (attendeesSpec.length === 0 || startMin === null || busy) return false;
    setBusy(true);
    try {
      const response = await fetch("/api/booking/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, startMin, attendees: attendeesSpec }),
      });
      const json: unknown = await response.json();
      if (!response.ok) {
        const failure = holdErrorSchema.safeParse(json);
        const message = failure.success ? failure.data.error : "این زمان دیگر آزاد نیست؛ گزینهٔ دیگری انتخاب کنید.";
        // Recovery, never a reset: keep the selection, offer the nearby starts.
        setStaffPlan((previous) => ({
          ...previous,
          error: message,
          value: previous.value ? { ...previous.value, plan: null, nearby: (failure.success ? failure.data.nearby : undefined) ?? previous.value.nearby, issues: [] } : null,
        }));
        setStep(2);
        toast.push(message, "error");
        return false;
      }
      const result = holdResponseSchema.safeParse(json);
      if (!result.success) {
        toast.push("نگهداری زمان انجام نشد. دوباره تلاش کنید.", "error");
        return false;
      }
      setHold({ plan: result.data.plan, expiry: new Date(result.data.expiresAt).getTime(), left: result.data.holdDurationSec });
      setStep(3);
      return true;
    } catch {
      setStaffPlan((previous) => ({ ...previous, error: "نگهداری زمان انجام نشد؛ اتصال برقرار نیست." }));
      toast.push("نگهداری زمان انجام نشد. دوباره تلاش کنید.", "error");
      return false;
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendeesSpec, startMin, date, busy]);

  async function continueFromPlan() {
    if (busy || !plan) return;
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!policyAccepted) {
      setPolicyOpen(true);
      return;
    }
    await waitForHold();
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
      if (accepted) await waitForHold();
      else setPolicyOpen(true);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "ادامه رزرو ممکن نشد.", "error");
    }
  }

  async function submit() {
    if (busy || startMin === null || !hold || hold.left < 1) return;
    setBusy(true);
    try {
      const response = await fetch("/api/appointments/group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          startMin,
          attendees: attendeesSpec.map((a) => ({
            attendeeId: a.attendeeId,
            attendeeName: a.attendeeId === "primary" ? user?.name ?? "مشتری" : companions.find((c) => c.id === a.attendeeId)?.name ?? "همراه",
            serviceIds: a.serviceIds,
            barberId: a.barberId,
          })),
        }),
      });
      const json: unknown = await response.json();
      if (!response.ok) {
        const failure = z.object({ error: z.string().optional(), nearby: z.array(z.number()).optional() }).safeParse(json);
        const message = failure.data?.error ?? "ثبت نوبت انجام نشد؛ زمان‌ها دوباره بررسی می‌شوند.";
        setStaffPlan((previous) => ({
          ...previous,
          error: message,
          value: previous.value
            ? { ...previous.value, plan: null, nearby: failure.data?.nearby?.length ? failure.data.nearby : previous.value.nearby }
            : previous.value,
        }));
        setHold(null);
        setStep(2);
        toast.push(message, "error");
        return;
      }
      const parsed = receiptSchema.safeParse(json);
      if (!parsed.success) throw new Error("رسید رزرو معتبر نیست.");
      if (parsed.data.paymentReference) {
        router.push(`/pay?ref=${encodeURIComponent(parsed.data.paymentReference)}`);
        return;
      }
      setReceipt(parsed.data);
      setHold(null);
      setStep(4);
      toast.push(parsed.data.visit.totalMinutes > 0 ? "نوبت شما ثبت شد." : "نوبت ثبت شد.", "success");
      router.refresh();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "ثبت نوبت انجام نشد؛ دوباره تلاش کنید.", "error");
    } finally {
      setBusy(false);
    }
  }

  function toggleServiceSelection(id: number) {
    setSelected((current) => {
      const mine = current[activeAttendee] ?? [];
      if (mine.includes(id))
        return { ...current, [activeAttendee]: mine.filter((x) => x !== id) };
      if (mine.length >= 12) {
        toast.push("حداکثر ۱۲ خدمت برای هر نفر در یک نوبت.", "error");
        return current;
      }
      const conflict = conflictsFor(id, mine);
      if (conflict) {
        toast.push(conflict, "error");
        return current;
      }
      return { ...current, [activeAttendee]: [...mine, id] };
    });
  }

  function resetAll() {
    setSelected(initialServiceId ? { primary: [initialServiceId] } : {});
    setCompanions([]);
    setActiveAttendee("primary");
    setDate(todayISO());
    setStartMin(null);
    setBarberFilter(null);
    setHold(null);
    setStep(0);
  }

  /* ================= step 4 — confirmation ================= */
  if (step === 4 && receipt) {
    const visit = receipt.visit;
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="ui-panel text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[18px] bg-[var(--color-accent-soft)] text-3xl font-black text-[var(--color-action-primary)]">✓</div>
          <h1 className="mt-5 text-2xl font-black">رزرو شما ثبت شد</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {formatPersianDate(visit.date)} · {minutesToLabel(visit.startMin)} تا {minutesToLabel(visit.endMin)}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {persianNum(visit.segments.length)} خدمت · {persianNum(visit.totalMinutes)} دقیقه · کد پیگیری{" "}
            <span className="font-bold text-[var(--color-text-primary)]">#{receipt.appointmentIds[0]}</span>
          </p>
          {receipt.requiresManagerApproval && (
            <p className="mt-4 rounded-[14px] bg-[var(--color-warning-soft)] p-3 text-xs leading-6 text-[var(--color-warning)]">
              این نوبت نیازمند تأیید مدیر است؛ پس از بررسی، وضعیت آن از پنل نوبت‌ها قابل مشاهده است.
            </p>
          )}
          <ol className="mt-6 space-y-2 text-right">
            {visit.segments.map((segment, index) => (
              <li key={`${segment.serviceId}-${index}`} className="rounded-[14px] bg-[var(--color-surface-sunken)] p-3 text-sm">
                <p className="font-bold">
                  {segment.serviceName}
                  <span className="mr-2 font-mono text-xs font-normal text-[var(--color-text-muted)]">
                    {minutesToLabel(segment.startMin)}–{minutesToLabel(segment.clientEndMin)}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {segment.barberName}
                  {segment.attendeeId !== "primary" ? ` · ${companions.find((c) => c.id === segment.attendeeId)?.name ?? "همراه"}` : ""}
                  {segment.processingMin > 0 ? ` · شامل ${persianNum(segment.processingMin)} دقیقه زمان پردازش` : ""}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm">
            {receipt.amountDueOnline > 0 && <span className="font-bold text-[var(--color-action-primary)]">پرداخت آنلاین: {formatPrice(receipt.amountDueOnline)}</span>}
            {receipt.remainingDue > 0 && <span className={receipt.amountDueOnline > 0 ? "mr-3 text-[var(--color-text-muted)]" : ""}>مانده در سالن: {formatPrice(receipt.remainingDue)}</span>}
          </p>
          <Link href="/account" className="ui-button mt-6 w-full">مشاهده نوبت من</Link>
          <button
            type="button"
            onClick={() =>
              downloadIcs(
                `booking-${receipt.appointmentIds[0]}.ics`,
                buildAppointmentIcs({
                  title: `${visit.segments.map((s) => s.serviceName).join(" + ")}، فرشید معروف پور`,
                  description: `کد رهگیری ${receipt.appointmentIds[0]} · ${visit.segments.map((s) => s.barberName).join("، ")}`,
                  location: "تهران، خیابان ولیعصر، پلاک ۱۲",
                  date: visit.date,
                  startMin: visit.startMin,
                  durationMin: visit.totalMinutes,
                  referenceId: receipt.appointmentIds[0],
                }),
              )
            }
            className="ui-button ui-button-quiet mt-3 w-full"
          >
            افزودن نوبت به تقویم
          </button>
          <Link href="/home" className="mt-5 inline-block text-sm text-[var(--color-text-muted)] hover:underline">بازگشت به خانه</Link>
        </div>
      </div>
    );
  }

  /* ================= shell ================= */
  return (
    <div className="mx-auto max-w-[720px] px-4 pb-40 pt-5 sm:px-6 sm:pb-32 sm:pt-9">
      <BookingAuthModal isOpen={authOpen && !user} onClose={() => setAuthOpen(false)} onAuthenticated={(signedIn) => void handleAuthenticated(signedIn)} demoPhoneHint={demoPhoneHint} />
      <BookingPolicySheet isOpen={policyOpen} onClose={() => setPolicyOpen(false)} onAccept={async () => { setPolicyAccepted(true); setPolicyOpen(false); await waitForHold(); }} version={policyVersion} items={policyItems} />

      <header className="mb-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (step === 0) router.push("/home");
            else if (step === 3) { setStep(2); }
            else setStep((step - 1) as 0 | 1 | 2);
          }}
          className="focus-ring flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-[var(--color-action-primary)]"
        >
          <Icon name="arrow" className="h-4 w-4 rotate-180 rtl:rotate-0" />
          بازگشت
        </button>
        <div aria-label={`مرحله ${step + 1} از ۴`} className="flex items-center gap-2">
          {stageLabels.map((label, index) => (
            <span key={label} title={label} className={`h-1.5 rounded-full transition-[width,background-color] duration-150 ${index === step ? "w-8 bg-[var(--color-action-primary)]" : index < step ? "w-4 bg-[var(--color-action-primary)]/50" : "w-4 bg-[var(--color-border-strong)]"}`} />
          ))}
        </div>
        <button type="button" onClick={resetAll} aria-label="شروع دوباره و بستن رزرو" className="focus-ring flex h-11 w-11 items-center justify-center rounded-xl">
          <Icon name="close" className="h-5 w-5" />
        </button>
      </header>

      {/* ============ STEP 0 — services ============ */}
      {step === 0 && (
        <section aria-labelledby="services-title">
          <div className="ui-pagehead">
            <h1 id="services-title">چه خدمتی می‌خواهید؟</h1>
            <p>روی کلید هر خدمت بزنید؛ می‌توانید چند خدمت را با هم انتخاب کنید.</p>
          </div>

          {/* attendees */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setActiveAttendee("primary")} aria-pressed={activeAttendee === "primary"} className={`focus-ring ui-pill min-h-11 !px-4 text-sm font-bold ${activeAttendee === "primary" ? "bg-[var(--color-action-primary)] text-white" : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"}`}>
              {user ? user.name : "خودتان"}
            </button>
            {companions.map((companion) => {
              const count = (selected[companion.id] ?? []).length;
              return (
                <span key={companion.id} className="inline-flex items-center gap-1">
                  <button type="button" onClick={() => setActiveAttendee(companion.id)} aria-pressed={activeAttendee === companion.id} className={`focus-ring ui-pill min-h-11 !px-4 text-sm font-bold ${activeAttendee === companion.id ? "bg-[var(--color-action-primary)] text-white" : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"}`}>
                    {companion.name}
                    {count > 0 && <span className="mr-1.5 rounded-full bg-[var(--color-accent-soft)] px-1.5 text-xs text-[var(--color-action-primary)]">{persianNum(count)}</span>}
                  </button>
                  <button type="button" aria-label={`حذف ${companion.name}`} onClick={() => { setCompanions((c) => c.filter((x) => x.id !== companion.id)); if (activeAttendee === companion.id) setActiveAttendee("primary"); }} className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-danger)]">
                    <Icon name="close" className="h-3.5 w-3.5" />
                  </button>
                </span>
              );
            })}
            <label className="inline-flex items-center gap-1.5">
              <label className="sr-only" htmlFor="companion-name">نام همراه</label>
              <input id="companion-name" value={newCompanionName} onChange={(e) => setNewCompanionName(e.target.value)} placeholder="افزودن همراه…" className="focus-ring h-11 w-32 rounded-pill border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm" />
              <button
                type="button"
                disabled={newCompanionName.trim().length < 2}
                onClick={() => {
                  const id = crypto.randomUUID();
                  setCompanions((current) => [...current, { id, name: newCompanionName.trim() }]);
                  setActiveAttendee(id);
                  setNewCompanionName("");
                }}
                className="focus-ring ui-pill min-h-11 border border-[var(--color-border)] px-3 text-sm font-bold text-[var(--color-action-primary)] disabled:opacity-40"
              >
                +
              </button>
            </label>
          </div>

          <div className="relative">
            <label htmlFor="service-search" className="sr-only">جست‌وجوی خدمت</label>
            <Icon name="search" className="pointer-events-none absolute right-4 top-3.5 h-5 w-5 text-[var(--color-text-muted)]" />
            <input id="service-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="مثلاً فید یا طراحی ریش" className="ui-input pr-11" />
          </div>
          {categories.length > 2 && (
            <div role="group" aria-label="دسته‌بندی خدمات" className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
              {categories.map((item) => (
                <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className={`focus-ring ui-pill min-h-11 shrink-0 !px-4 ${category === item ? "bg-[var(--color-text-primary)] text-[var(--color-bg)]" : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"}`}>
                  {item}
                </button>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs leading-6 text-[var(--color-text-muted)]">
            برای خدمات چندتایی نگران ساعت جداگانه نباشید — شما فقط یک ساعت شروع انتخاب می‌کنید و بقیه را سیستم می‌چیند.
          </p>

          <div className="mt-4 space-y-2">
            {filteredServices.length ? (
              filteredServices.map((item) => {
                const isOn = activeIds.includes(item.id);
                const notOffered = !offeredServiceIds.has(item.id);
                const conflict = notOffered ? "در حال حاضر هیچ آرایشگری این خدمت را ارائه نمی‌دهد." : conflictsFor(item.id, activeIds);
                const disabled = notOffered || (conflict !== null && !isOn);
                return (
                  <div key={item.id} className={`bk-row ${isOn ? "bk-row-on" : ""} ${disabled ? "bk-row-disabled" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <strong className="block text-[15px] font-bold">{item.name}</strong>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {persianNum(item.durationMin)} دقیقه · {formatPrice(item.basePrice)}
                      </p>
                      {disabled && conflict && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[var(--color-warning)]">
                          <Icon name="close" className="h-3 w-3" />
                          {conflict}
                          <button type="button" onClick={() => setSelected((current) => ({ ...current, [activeAttendee]: (current[activeAttendee] ?? []).filter((x) => x !== item.id) }))} className="underline">حذف تضاد</button>
                        </p>
                      )}
                      {notOffered && <p className="mt-1.5 text-xs font-semibold text-[var(--color-warning)]">این خدمت فعلاً توسط آرایشگران سالن ارائه نمی‌شود.</p>}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      aria-disabled={disabled}
                      disabled={disabled}
                      aria-label={`انتخاب ${item.name}`}
                      onClick={() => toggleServiceSelection(item.id)}
                      className="bk-switch"
                      data-on={isOn}
                    >
                      <span className="bk-switch-thumb" />
                    </button>
                  </div>
                );
              })
            ) : (
              <div role="status" className="ui-panel text-center text-sm text-[var(--color-text-muted)]">خدمتی با این جست‌وجو پیدا نشد.</div>
            )}
          </div>

          {/* sticky service summary — always available */}
          {selectionCount > 0 && (
            <div className="safe-bottom bk-sticky">
              <div className="min-w-0">
                <p className="text-sm font-black">{persianNum(selectionCount)} خدمت · {persianNum(totalMinutes)} دقیقه</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">از {formatPrice(totalPriceFrom)}{totalPriceFrom > 0 ? " · قیمت نهایی در سرور" : ""}</p>
              </div>
              <button type="button" onClick={() => setStep(1)} className="ui-button shrink-0 !min-h-11 !px-6">
                انتخاب زمان
              </button>
            </div>
          )}
        </section>
      )}

      {/* ============ STEP 1 — date & time ============ */}
      {step === 1 && (
        <section aria-labelledby="time-title">
          <div className="ui-pagehead">
            <h1 id="time-title">کِی میایید؟</h1>
            <p>یک ساعت شروع برای کل {persianNum(selectionCount)} خدمت انتخاب کنید.</p>
          </div>

          <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="انتخاب روز">
            {dates.map((item, index) => {
              const label = index === 0 ? "امروز" : index === 1 ? "فردا" : new Intl.DateTimeFormat("fa-IR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${item}T00:00:00Z`));
              const dayNum = new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${item}T00:00:00Z`));
              const selected2 = item === date;
              return (
                <button key={item} type="button" onClick={() => { setDate(item); setStartMin(null); setStep(1); }} aria-pressed={selected2} className={`focus-ring bk-day ${selected2 ? "bk-day-on" : ""}`}>
                  <span className="block text-xs opacity-80">{label}</span>
                  <span className="mt-1 block text-base font-black">{dayNum}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => setShowFullCalendar((v) => !v)} className="focus-ring bk-day" aria-expanded={showFullCalendar}>
              <span className="block text-xs">تقویم</span>
              <span className="mt-1 block text-base font-black">همه</span>
            </button>
          </div>
          {showFullCalendar && (
            <div className="mt-3">
              <label className="ui-label" htmlFor="full-date">تاریخ دیگر</label>
              <input id="full-date" type="date" dir="ltr" min={todayISO()} max={addDaysISO(todayISO(), 60)} value={date} onChange={(e) => { if (isValidValue(e.target.value)) { setDate(e.target.value); setStartMin(null); } }} className="ui-input" />
            </div>
          )}

          <div aria-live="polite" className="mt-5 min-h-[140px]">
            {gridError ? (
              <div role="alert" className="rounded-[16px] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">{gridError}</div>
            ) : gridValue?.issues?.length ? (
              <div role="alert" className="rounded-[16px] border border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] p-4 text-sm leading-7 text-[var(--color-warning)]">
                {gridValue.issues.map((issue) => <p key={issue.code + issue.message}>{issue.message}</p>)}
                <button type="button" onClick={() => setStep(0)} className="focus-ring mt-2 font-bold underline">ویرایش خدمات</button>
              </div>
            ) : gridLoading ? (
              <TimeGridSkeleton />
            ) : (gridValue?.validStarts.length ?? 0) === 0 ? (
              <div role="status" className="ui-panel text-sm leading-7 text-[var(--color-text-muted)]">
                برای {formatPersianDate(date)} زمان آزادی که کل این خدمات را پوشش بدهد پیدا نشد. روز دیگری را امتحان کنید یا خدمات را کم کنید.
              </div>
            ) : (
              <TimeGrid
                validStarts={validStarts}
                selected={startMin}
                onPick={(minute) => { setStartMin(minute); setStep(2); }}
              />
            )}
          </div>

          {startMin !== null && (
            <div className="safe-bottom bk-sticky">
              <div className="min-w-0">
                <p className="text-sm font-black">{formatPersianDate(date)} · {minutesToLabel(startMin)}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{persianNum(selectionCount)} خدمت پشت سر هم از همین ساعت</p>
              </div>
              <button type="button" onClick={() => setStep(2)} className="ui-button shrink-0 !min-h-11 !px-6">دیدن آرایشگر</button>
            </div>
          )}
        </section>
      )}

      {/* ============ STEP 2 — staff / plan ============ */}
      {step === 2 && (
        <section aria-labelledby="staff-title">
          <div className="ui-pagehead">
            <h1 id="staff-title">با چه آرایشگری؟</h1>
            <p>{formatPersianDate(date)} · شروع {startMin !== null ? minutesToLabel(startMin) : "—"} · سیستم کل visits را می‌چیند.</p>
          </div>

          <div role="group" aria-label="فیلتر آرایشگر" className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <button type="button" onClick={() => { setBarberFilter(null); }} aria-pressed={barberFilter === null} className={`focus-ring ui-pill min-h-11 shrink-0 !px-4 text-sm font-bold ${barberFilter === null ? "bg-[var(--color-action-primary)] text-white" : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"}`}>
              همه آرایشگران
            </button>
            {barbersList.map((barber) => (
              <button key={barber.id} type="button" onClick={() => setBarberFilter(barber.id)} aria-pressed={barberFilter === barber.id} className={`focus-ring ui-pill min-h-11 shrink-0 !px-4 text-sm ${barberFilter === barber.id ? "bg-[var(--color-action-primary)] font-bold text-white" : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"}`}>
                {barber.name}
              </button>
            ))}
          </div>

          <div aria-live="polite" className="mt-5 min-h-[180px]">
            {planLoading ? (
              <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-[20px] bg-[var(--color-surface-sunken)]" />)}</div>
            ) : planError ? (
              <div role="alert" className="rounded-[16px] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">
                {planError}
                <button type="button" onClick={() => setStaffPlan((p) => ({ ...p, error: null }))} className="focus-ring mr-2 font-bold underline">تلاش دوباره</button>
              </div>
            ) : plan ? (
              <>
                <div className={`ui-panel ${staffPlan.stale ? "opacity-70" : ""}`}>
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-base font-black">
                      {minutesToLabel(plan.startMin)}–{minutesToLabel(plan.endMin)}
                      <span className="mr-2 rounded-pill bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-action-primary)]">یک نوبت · {persianNum(plan.totalMinutes)} دقیقه</span>
                    </span>
                    <span className="text-sm font-bold">{formatPrice(plan.totalPrice)}</span>
                  </p>
                  <ol className="mt-4 space-y-2">
                    {plan.segments.map((segment, index) => (
                      <li key={`${segment.serviceId}-${index}`} className="bk-seg">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">{segment.serviceName}
                            {segment.attendeeId !== "primary" && <span className="mr-2 text-xs font-normal text-[var(--color-text-muted)]">برای {companions.find((c) => c.id === segment.attendeeId)?.name ?? "همراه"}</span>}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                            <Link data-segment-barber={segment.barberSlug} href={`/barbers/${segment.barberSlug}`} className="font-semibold underline-offset-2 hover:underline">{segment.barberName}</Link>
                            {" · "}
                            <span dir="ltr" className="font-mono">{minutesToLabel(segment.startMin)}–{minutesToLabel(segment.clientEndMin)}</span>
                            {segment.processingMin > 0 && <span> · {persianNum(segment.processingMin)} دقیقه پردازش</span>}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold tabular-nums">{formatPrice(segment.price)}</span>
                      </li>
                    ))}
                  </ol>
                  {plan.distinctBarbers > 1 && (
                    <p className="mt-3 rounded-[14px] bg-[var(--color-surface-sunken)] p-3 text-xs leading-6 text-[var(--color-text-muted)]">
                      این خدمات بین {persianNum(plan.distinctBarbers)} آرایشگر تقسیم شده است؛ شما یک نوبت دارید، نه چند نوبت.
                    </p>
                  )}
                  {plan.requiresManagerApproval && (
                    <p className="mt-3 text-xs font-semibold text-[var(--color-warning)]">این نوبت پس از ثبت نیازمند تأیید مدیر سالن است.</p>
                  )}
                </div>

              </>
            ) : (
              <div className="ui-panel">
                <p className="text-sm leading-7 text-[var(--color-text-muted)]">
                  {planValue?.issues?.[0]?.message ??
                    (barberFilter
                      ? `${barbersList.find((b) => b.id === barberFilter)?.name ?? "این آرایشگر"} در ساعت ${startMin !== null ? minutesToLabel(startMin) : "—"} برای کل این خدمات آزاد نیست.`
                      : `ساعت ${startMin !== null ? minutesToLabel(startMin) : "—"} برای کل این خدمات پر شده است.`)}
                </p>
                {(planValue?.nearby.length ?? 0) > 0 && (
                  <>
                    <p className="mt-3 text-xs font-bold text-[var(--color-text-secondary)]">نزدیک‌ترین زمان‌های آزاد:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {planValue?.nearby.map((minute) => (
                        <button key={minute} type="button" onClick={() => setStartMin(minute)} className="focus-ring min-h-11 rounded-xl bg-[var(--color-accent-soft)] px-4 text-sm font-bold text-[var(--color-action-primary)]">
                          {minutesToLabel(minute)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button type="button" onClick={() => { setBarberFilter(null); }} className="focus-ring mt-4 min-h-11 text-sm font-bold text-[var(--color-action-primary)] underline">
                  لغو فیلتر آرایشگر و دیدن همه گزینه‌ها
                </button>
              </div>
            )}
          </div>

          {!user && (
            <p className="mt-4 rounded-[16px] bg-[var(--color-accent-soft)] p-4 text-sm leading-7 text-[var(--color-text-secondary)]">
              بعد از این مرحله با شماره موبایل وارد شوید؛ زمان برای شما نگه داشته می‌شود و رزرو را یکجا بررسی می‌کنید.
            </p>
          )}

          <div className="safe-bottom bk-sticky">
            <div className="min-w-0">
              <p className="text-sm font-black">{plan ? `${persianNum(plan.segments.length)} خدمت · ${formatPrice(plan.totalPrice)}` : "—"}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{plan ? "ورود، قوانین و پرداخت در مرحله بعد" : "برای ادامه، یک زمان دیگر انتخاب کنید"}</p>
            </div>
            <button type="button" onClick={() => void continueFromPlan()} disabled={!plan || busy || planLoading} className="ui-button shrink-0 !min-h-11 !px-6">
              {busy ? "در حال بررسی…" : user ? "ادامه و رزرو" : "ورود / ساخت حساب و ادامه"}
            </button>
          </div>
        </section>
      )}

      {/* ============ STEP 3 — summary / hold / commit ============ */}
      {step === 3 && hold && (
        <section aria-labelledby="summary-title">
          <div className="ui-pagehead">
            <h1 id="summary-title">بازبینی و ثبت</h1>
            <p>همه‌چیز همین است؛ بعد از ثبت، رسید و کد پیگیری می‌گیرید.</p>
          </div>

          {user && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
              <p>رزرو برای <strong>{user.name}</strong> <span dir="ltr" className="font-semibold text-[var(--color-text-muted)]">{user.phone}</span></p>
              <button type="button" onClick={() => setStep(2)} className="focus-ring min-h-11 shrink-0 text-xs font-bold text-[var(--color-action-primary)]">تغییر</button>
            </div>
          )}

          <div role="status" aria-live="polite" className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[16px] border p-4 text-sm font-semibold ${hold.left > 0 ? "border-[var(--color-accent-line)] bg-[var(--color-accent-soft)] text-[var(--color-action-primary)]" : "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] text-[var(--color-danger)]"}`}>
            <span>{hold.left > 0 ? "این زمان موقتاً برای کل نوبت شما نگه داشته شده است." : "مهلت نگه‌داشتن تمام شد؛ زمان دوباره بررسی می‌شود."}</span>
            <span dir="ltr" className="font-mono text-lg tabular-nums">
              {String(Math.floor(hold.left / 60)).padStart(2, "0")}:{String(hold.left % 60).padStart(2, "0")}
            </span>
          </div>

          <div className="ui-panel space-y-3 text-sm">
            <VisitSummaryRow label="تاریخ" value={formatPersianDate(hold.plan.date)} />
            <VisitSummaryRow label="زمان نوبت" value={`${minutesToLabel(hold.plan.startMin)}–${minutesToLabel(hold.plan.endMin)}`} strong />
            <VisitSummaryRow label="مدت کل" value={`${persianNum(hold.plan.totalMinutes)} دقیقه`} />
            <div className="border-t border-[var(--color-border)] pt-3">
              <ol className="space-y-2">
                {hold.plan.segments.map((segment, index) => (
                  <li key={index} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{segment.serviceName}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{segment.barberName} · <span dir="ltr" className="font-mono">{minutesToLabel(segment.startMin)}–{minutesToLabel(segment.clientEndMin)}</span></p>
                    </div>
                    <span className="shrink-0 tabular-nums">{formatPrice(segment.price)}</span>
                  </li>
                ))}
              </ol>
            </div>
            <VisitSummaryRow label="مبلغ خدمات" value={formatPrice(hold.plan.totalPrice)} />
            {hold.plan.amountDueOnline > 0 && <VisitSummaryRow label={hold.plan.segments.some((s) => s.paymentMode === "FULL_PAYMENT") ? "پرداخت آنلاین" : "بیعانه آنلاین"} value={formatPrice(hold.plan.amountDueOnline)} />}
            <VisitSummaryRow label="مانده در سالن" value={formatPrice(hold.plan.remainingDue)} />
          </div>

          <p className="mt-4 text-xs leading-6 text-[var(--color-text-muted)]">
            مبلغ نهایی و آزاد بودن زمان در سرور دوباره بررسی می‌شود؛ نوبت دارای بیعانه پس از تأیید پرداخت قطعی خواهد شد.
          </p>

          <div className="safe-bottom bk-sticky">
            <button type="button" onClick={() => { setHold(null); setStaffPlan((p) => ({ ...p, error: null })); void (async () => { if (user && policyAccepted) await waitForHold(); else setStep(2); })(); }} className="focus-ring ui-button ui-button-quiet shrink-0 !min-h-11">
              بررسی دوباره زمان
            </button>
            <button type="button" onClick={() => void submit()} disabled={busy || hold.left < 1} className="ui-button !min-h-11 flex-1">
              {busy ? "در حال ثبت…" : hold.left < 1 ? "مهلت تمام شد — زمان را دوباره بگیرید" : hold.plan.amountDueOnline > 0 ? "ثبت و پرداخت" : "تأیید و ثبت نوبت"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function isValidValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function VisitSummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className={strong ? "font-black" : "font-bold"}>{value}</span>
    </div>
  );
}

function TimeGridSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      {[0, 1].map((block) => (
        <div key={block}>
          <div className="h-4 w-16 animate-pulse rounded-md bg-[var(--color-surface-sunken)]" />
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-11 w-[74px] animate-pulse rounded-xl bg-[var(--color-surface-sunken)]" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Compact grouped time grid. Unavailable times ARE shown but disabled, so the
 * client understands the hour exists and the capacity ran out — the difference
 * matters and is stated without color alone.
 */
function TimeGrid({ validStarts, selected, onPick }: { validStarts: Set<number>; selected: number | null; onPick: (minute: number) => void }) {
  const minutes: number[] = [];
  for (let m = 9 * 60; m + 30 <= 23 * 60; m += 30) minutes.push(m);
  return (
    <div className="space-y-4">
      {DAY_PARTS.map((part) => {
        const partMinutes = minutes.filter((m) => m >= part.from && m < part.to);
        if (partMinutes.length === 0) return null;
        const freeCount = partMinutes.filter((m) => validStarts.has(m)).length;
        return (
          <div key={part.label}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-black text-[var(--color-text-secondary)]">{part.label}</h3>
              <span className="text-[11px] text-[var(--color-text-muted)]">{persianNum(freeCount)} زمان آزاد برای کل خدمات</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {partMinutes.map((m) => {
                const open = validStarts.has(m);
                const isSelected = selected === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!open}
                    aria-pressed={isSelected}
                    onClick={() => onPick(m)}
                    title={open ? "رزرو از این ساعت" : "این ساعت وجود دارد اما ظرفیت ندارد"}
                    className={`focus-ring bk-time ${isSelected ? "bk-time-on" : ""}`}
                    dir="ltr"
                  >
                    {minutesToLabel(m)}
                    {!open && <span className="mt-0.5 block text-[9px] opacity-70">ظرفیت ندارد</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
