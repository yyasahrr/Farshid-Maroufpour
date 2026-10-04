"use client";

/**
 * Customer booking wizard — one selection, ONE start time, one visit.
 *
 * Step model (design/ux/booking-flow.md):
 *   0 services (multi-select; a conflicting pick auto-swaps) → 1 barber
 *   (pick a person, or let the salon arrange) → 2 date & single start time →
 *   3 review: plan, hold, identity (guest checkout OR code login — the LAST
 *   step before paying, never a modal in the middle), policy, commit →
 *   4 confirmation.
 * Prices, staff and availability come from /api/booking/plan and are
 * re-validated again inside the booking transaction; a hold keyed by phone
 * (even before login) covers the whole visit.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { z } from "zod";
import type { AuthUser } from "@/components/booking/BookingAuthModal";
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

/** Accept Persian digits, dashes, +98 — always return 09xxxxxxxxx for the API. */
function localMobile(value: string): string {
  let phone = value.trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\s\-()]/g, "");
  if (phone.startsWith("+98")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("0098")) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith("98")) phone = `0${phone.slice(2)}`;
  else if (phone.startsWith("9") && phone.length === 10) phone = `0${phone}`;
  return phone;
}

function latinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/\D/g, "");
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
    initialServiceId ? (initialStartMin !== undefined ? 3 : 1) : 0,
  );
  const [selected, setSelected] = useState<AttendeeSelection>(() =>
    initialServiceId ? { primary: [initialServiceId] } : { primary: [] },
  );
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [activeAttendee, setActiveAttendee] = useState<string>("primary");
  const [newCompanionName, setNewCompanionName] = useState("");
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [startMin, setStartMin] = useState<number | null>(initialStartMin ?? null);
  /** step-1 per-group barber choices: key = group's serviceIds joined.
   *  null means "customer explicitly chose auto for this group" and also
   *  overrides the deep-link seed. */
  const [groupPins, setGroupPins] = useState<Record<string, number | null>>({});
  const [category, setCategory] = useState("همه");
  const [search, setSearch] = useState("");
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  /** Shown after a conflict auto-swap: which old pick was dropped and why. */
  const [swapNote, setSwapNote] = useState<string | null>(null);

  const [user, setUser] = useState(initialUser);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  /* ---- review-step identity (guest checkout / code login) ---- */
  const [checkoutTab, setCheckoutTab] = useState<"guest" | "login">("guest");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [tabError, setTabError] = useState<string | null>(null);
  const [otpStage, setOtpStage] = useState<"phone" | "code">("phone");
  const [otpCode, setOtpCode] = useState<string[]>(Array(6).fill(""));
  const [previewCode, setPreviewCode] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const otpInputs = useRef<(HTMLInputElement | null)[]>([]);
  const verifying = useRef(false);

  const [grid, setGrid] = useState<{ key: string; value: PlanResponse | null; error: string | null }>({ key: "", value: null, error: null });
  const [staffPlan, setStaffPlan] = useState<{ key: string; value: PlanResponse | null; error: string | null; stale?: boolean }>({ key: "", value: null, error: null });
  const [hold, setHold] = useState<{ plan: VisitPlan; expiry: number; left: number; keyedBy: "anon" | "phone" | "session" } | null>(null);
  const [holdError, setHoldError] = useState<{ message: string; nearby: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<z.infer<typeof receiptSchema> | null>(null);
  const requestId = useRef(0);
  const autoHeldKey = useRef("");
  /** Anonymous hold identity for the pre-login phase: survives reloads in the
   *  same tab so the 10-minute lock belongs to this visitor even before they
   *  type a phone number. */
  const holdToken = useMemo(() => {
    const KEY = "bk-hold-token";
    try {
      const saved = window.sessionStorage.getItem(KEY);
      if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
      const fresh = crypto.randomUUID();
      window.sessionStorage.setItem(KEY, fresh);
      return fresh;
    } catch {
      return crypto.randomUUID();
    }
  }, []);

  const stageLabels = ["خدمت", "آرایشگر", "زمان", "بازبینی"];

  const activeIds = selected[activeAttendee] ?? [];
  const primaryIds = useMemo(() => selected.primary ?? [], [selected]);

  /* ---- barber-step eligibility (mirror of planner constraints, server stays authority) ---- */
  const forcedSameBarberPairs = useMemo(
    () => combinationRules.filter((r) => r.sameBarberRequired && primaryIds.includes(r.a) && primaryIds.includes(r.b)),
    [combinationRules, primaryIds],
  );
  /** eligibility of one barber for ONE group of services (the group must stay
   *  with a single person — that is what same-barber rules mean). */
  const barberEvaluation = useCallback((barber: BookingBarberItem, serviceIds: number[]) => {
    const missing = serviceIds.filter((id) => !barber.serviceIds.includes(id));
    return {
      eligible: missing.length === 0,
      missing,
      reason: missing.length === 0
        ? serviceIds.length > 1
          ? "هر دو خدمت را با هم انجام می‌دهد."
          : "این خدمت را انجام می‌دهد."
        : serviceIds.length > 1
          ? `«${missing.map((id) => servicesList.find((x) => x.id === id)?.name ?? "خدمت").join(" و ")}» را ندارد و این گروه باید یک‌نفری باشد.`
          : "این خدمت را انجام نمی‌دهد.",
    };
  }, [servicesList]);
  /** The primary selection partitioned by same-barber rules: paired services
   *  form one group, everything else is its own group. One barber per group. */
  const barberGroups = useMemo(() => {
    const parent = new Map<number, number>();
    for (const id of primaryIds) parent.set(id, id);
    const find = (x: number): number => {
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      let walk = x;
      while (parent.get(walk) !== root) {
        const next = parent.get(walk)!;
        parent.set(walk, root);
        walk = next;
      }
      return root;
    };
    for (const rule of forcedSameBarberPairs) {
      const ra = find(rule.a);
      const rb = find(rule.b);
      if (ra !== rb) parent.set(ra, rb);
    }
    const byRoot = new Map<number, number[]>();
    for (const id of primaryIds) {
      const root = find(id);
      byRoot.set(root, [...(byRoot.get(root) ?? []), id]);
    }
    return [...byRoot.values()].map((ids) => ({ key: ids.join("_"), serviceIds: ids }));
  }, [primaryIds, forcedSameBarberPairs]);
  /** A barber chosen for an older selection must not haunt the new one — the
   *  pin only applies while still eligible, derived per render, never via an
   *  effect that resets state. */
  /* deep-link (barber page → wizard): that barber pre-selects every group they
     can genuinely serve — derived from props so no effect or state seeding is
     needed, and any explicit click (even "auto") overrides it per group. */
  const initialBarberSeed = useMemo(() => {
    if (initialBarberId == null || barbersList.length === 0) return {};
    const barber = barbersList.find((b) => b.id === initialBarberId);
    if (!barber) return {};
    const out: Record<string, number> = {};
    for (const group of barberGroups) if (barberEvaluation(barber, group.serviceIds).eligible) out[group.key] = barber.id;
    return out;
  }, [initialBarberId, barbersList, barberGroups, barberEvaluation]);
  const activePins = useMemo(() => {
    const out: Record<string, number> = {};
    for (const group of barberGroups) {
      const chosen = group.key in groupPins ? groupPins[group.key] : initialBarberSeed[group.key] ?? null;
      if (chosen == null) continue;
      const barber = barbersList.find((b) => b.id === chosen);
      if (barber && barberEvaluation(barber, group.serviceIds).eligible) out[group.key] = chosen;
    }
    return out;
  }, [groupPins, initialBarberSeed, barberGroups, barbersList, barberEvaluation]);
  /** flattened {serviceId, barberId} payload for plan/hold/group requests */
  const primaryPins = useMemo(
    () =>
      barberGroups.flatMap((group) =>
        activePins[group.key] !== undefined
          ? group.serviceIds.map((serviceId) => ({ serviceId, barberId: activePins[group.key] }))
          : [],
      ),
    [barberGroups, activePins],
  );
  const hasPinnedBarber = primaryPins.length > 0;

  const attendeesSpec = useMemo(() => {
    const list: { attendeeId: string; serviceIds: number[]; barberId: number | null; servicePins?: { serviceId: number; barberId: number }[] }[] = [
      { attendeeId: "primary", serviceIds: selected.primary ?? [], barberId: null, servicePins: primaryPins },
    ];
    for (const companion of companions) {
      const ids = selected[companion.id] ?? [];
      if (ids.length > 0) list.push({ attendeeId: companion.id, serviceIds: ids, barberId: null });
    }
    return list.filter((a) => a.serviceIds.length > 0);
  }, [selected, primaryPins, companions]);

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

  /** Which currently-selected services a candidate would knock out (mirror of server rules). */
  const conflictingSelected = useCallback(
    (candidateId: number, currentIds: number[]): number[] =>
      currentIds.filter((other) => {
        if (other === candidateId) return false;
        const [a, b] = candidateId < other ? [candidateId, other] : [other, candidateId];
        const rule = combinationRules.find((r) => r.a === a && r.b === b);
        return Boolean(rule && !rule.canCombine);
      }),
    [combinationRules],
  );

  /** The salon's own note for the first blocking rule between two services. */
  const conflictReason = useCallback(
    (candidateId: number, droppedIds: number[]): string => {
      for (const other of droppedIds) {
        const [a, b] = candidateId < other ? [candidateId, other] : [other, candidateId];
        const rule = combinationRules.find((r) => r.a === a && r.b === b);
        if (rule && !rule.canCombine)
          return rule.note.trim() ? rule.note.trim() : "این دو خدمت هم‌زمان انجام نمی‌شوند.";
      }
      return "";
    },
    [combinationRules],
  );

  /** Services no active barber offers at all — disabled WITH a reason, not just grey. */
  const offeredServiceIds = useMemo(() => new Set(barbersList.flatMap((b) => b.serviceIds)), [barbersList]);

  /* ---- data fetching: grid for step 2, full plan for step 3 ---- */
  const gridKey = `grid:${JSON.stringify(attendeesSpec)}:${date}`;
  const planKey = `plan:${JSON.stringify(attendeesSpec)}:${date}:${startMin ?? "none"}`;

  useEffect(() => {
    if (step !== 2 || attendeesSpec.length === 0) return;
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
  }, [step === 2, gridKey, date]);

  useEffect(() => {
    if (step !== 3 || startMin === null || attendeesSpec.length === 0) return;
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
  }, [step === 3, planKey, date, startMin]);

  const planValue: PlanResponse | null = staffPlan.key === planKey ? staffPlan.value : null;
  const planError = staffPlan.key === planKey ? staffPlan.error : null;
  const planLoading = step === 3 && staffPlan.key !== planKey;

  const gridValue: PlanResponse | null = grid.key === gridKey ? grid.value : null;
  const gridError = grid.key === gridKey ? grid.error : null;
  const gridLoading = step === 2 && grid.key !== gridKey;
  const validStarts = useMemo(() => new Set(gridValue?.validStarts ?? []), [gridValue]);
  /** The plan the review shows: held (authoritative) or preview from the server. */
  const reviewPlan: VisitPlan | null = hold?.plan ?? planValue?.plan ?? null;
  const nearbyStarts = useMemo(() => {
    const list = holdError?.nearby?.length ? holdError.nearby : planValue?.nearby ?? [];
    return [...new Set(list)].sort((x, y) => x - y).slice(0, 3);
  }, [holdError, planValue]);

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

  /* the window closed while the customer was still deciding: re-arm the hold
     quietly (the planner re-checks everything server-side; if somebody took
     the slot we fall back to "نزدیک‌ترین زمان‌ها" without clearing the pick). */
  useEffect(() => {
    if (step !== 3 || !hold || hold.left > 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      autoHeldKey.current = "";
      setHold(null);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
     
  }, [step, hold]);

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

  /* ---- returning customer: OTP cooldown + focus (was in the auth modal) ---- */
  useEffect(() => {
    if (otpStage !== "code") return;
    const focus = window.setTimeout(() => otpInputs.current[0]?.focus(), 40);
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { window.clearTimeout(focus); window.clearInterval(timer); };
  }, [otpStage]);

  const waitForHold = useCallback(async (contactPhone?: string): Promise<boolean> => {
    if (attendeesSpec.length === 0 || startMin === null || busy) return false;
    setBusy(true);
    try {
      const response = await fetch("/api/booking/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          startMin,
          attendees: attendeesSpec,
          ...(contactPhone ? { contactPhone } : {}),
          holdToken,
        }),
      });
      const json: unknown = await response.json();
      if (!response.ok) {
        const failure = holdErrorSchema.safeParse(json);
        const message = failure.success ? failure.data.error : "این زمان دیگر آزاد نیست؛ گزینهٔ دیگری انتخاب کنید.";
        // Recovery, never a reset: keep the selection, offer the nearby starts.
        setHold(null);
        setHoldError({ message, nearby: failure.success ? failure.data.nearby ?? [] : [] });
        toast.push(message, "error");
        return false;
      }
      const result = holdResponseSchema.safeParse(json);
      if (!result.success) {
        toast.push("نگهداری زمان انجام نشد. دوباره تلاش کنید.", "error");
        return false;
      }
      setHoldError(null);
      setHold({
        plan: result.data.plan,
        expiry: new Date(result.data.expiresAt).getTime(),
        left: result.data.holdDurationSec,
        keyedBy: user ? "session" : contactPhone ? "phone" : "anon",
      });
      return true;
    } catch {
      setHoldError({ message: "نگهداری زمان انجام نشد؛ اتصال برقرار نیست.", nearby: [] });
      toast.push("نگهداری زمان انجام نشد. دوباره تلاش کنید.", "error");
      return false;
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendeesSpec, startMin, date, busy, user, holdToken]);

  /* the review step locks the WHOLE plan for 10 minutes right away — logged-in
     or anonymous; nobody else can take the slot while identity/payment happen */
  useEffect(() => {
    if (step !== 3 || startMin === null || busy || attendeesSpec.length === 0) return;
    if (hold && hold.left > 0) return;
    if (autoHeldKey.current === planKey) return;
    autoHeldKey.current = planKey;
    void waitForHold(!user && /^09\d{9}$/.test(localMobile(guestPhone)) ? localMobile(guestPhone) : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, startMin, planKey, hold?.left, user, guestPhone]);

  async function submit(primaryName: string, allowRetry = true): Promise<void> {
    if (busy || startMin === null || !hold || hold.left < 1) return;
    setBusy(true);
    try {
      const response = await fetch("/api/appointments/group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          startMin,
          holdToken,
          attendees: attendeesSpec.map((a) => ({
            attendeeId: a.attendeeId,
            attendeeName: a.attendeeId === "primary" ? primaryName || "مشتری" : companions.find((c) => c.id === a.attendeeId)?.name ?? "همراه",
            serviceIds: a.serviceIds,
            barberId: a.barberId,
          })),
        }),
      });
      const json: unknown = await response.json();
      if (!response.ok) {
        const failure = z.object({ error: z.string().optional(), nearby: z.array(z.number()).optional() }).safeParse(json);
        const message = failure.data?.error ?? "ثبت نوبت انجام نشد؛ زمان‌ها دوباره بررسی می‌شوند.";
        // The 10-minute window closed between review and pay: grab the time
        // again and retry ONCE before bothering the customer.
        if (allowRetry && /مهلت|نگهداری/.test(message) && failure.data?.nearby?.length !== 0) {
          setBusy(false);
          const reheld = await waitForHold(user ? undefined : localMobile(guestPhone) || undefined);
          if (reheld) {
            setBusy(true);
            await submit(primaryName, false);
            return;
          }
          setBusy(true);
        }
        setHold(null);
        setHoldError({ message, nearby: failure.data?.nearby ?? [] });
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
      try { window.sessionStorage.removeItem("bk-hold-token"); } catch {}
      setStep(4);
      toast.push(parsed.data.visit.totalMinutes > 0 ? "نوبت شما ثبت شد." : "نوبت ثبت شد.", "success");
      router.refresh();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "ثبت نوبت انجام نشد؛ دوباره تلاش کنید.", "error");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- review-step identity: guest checkout & code login ---------- */

  async function sendOtp(): Promise<void> {
    const mobile = localMobile(loginPhone);
    if (busy || !/^09\d{9}$/.test(mobile)) { setTabError("شمارهٔ موبایل ۱۱ رقمی و با ۰۹ شروع شود."); return; }
    setBusy(true);
    setTabError(null);
    try {
      const response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: mobile }),
      });
      const result: { error?: string; devCode?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ارسال کد انجام نشد. دوباره تلاش کنید.");
      setLoginPhone(mobile);
      setOtpCode(Array(6).fill(""));
      setPreviewCode(result.devCode ?? "");
      setCooldownUntil(Date.now() + 60_000);
      setClock(Date.now());
      setOtpStage("code");
    } catch (err) {
      setTabError(err instanceof Error ? err.message : "ارسال کد انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(value: string): Promise<void> {
    if (verifying.current || value.length !== 6) return;
    verifying.current = true;
    setBusy(true);
    setTabError(null);
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: localMobile(loginPhone), code: value }),
      });
      const result: { error?: string; isFirstTime?: boolean; user?: AuthUser } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "کد واردشده صحیح نیست.");
      if (result.isFirstTime) {
        // No account behind this number: the guest tab is the one correct path —
        // never let someone re-register through the login form.
        setGuestPhone(localMobile(loginPhone));
        setOtpStage("phone");
        setCheckoutTab("guest");
        setTabError("حسابی با این شماره پیدا نشد؛ نامت را در تب «مشتری جدید» وارد کن — همان‌جا خودکار ساخته می‌شود.");
        return;
      }
      if (!result.user) throw new Error("ورود انجام نشد. دوباره تلاش کنید.");
      setUser(result.user);
      setOtpStage("phone");
      setTabError(null);
      // The session may own a different number than the pre-login hold was keyed
      // to; drop the old hold so the fresh (session-keyed) one replaces it.
      setHold(null);
      let accepted = false;
      try {
        const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const me: { policyAccepted?: boolean } = await meResponse.json();
        accepted = Boolean(meResponse.ok && me.policyAccepted);
        setPolicyAccepted(accepted);
      } catch {
        accepted = false;
      }
      if (!accepted) { setBusy(false); verifying.current = false; return; } // CTA now opens the sheet
      // hold the moment the session exists — same phone, same hold (or a fresh one)
      await waitForHold();
    } catch (err) {
      setTabError(err instanceof Error ? err.message : "بررسی کد انجام نشد.");
      setOtpCode(Array(6).fill(""));
      otpInputs.current[0]?.focus();
    } finally {
      setBusy(false);
      verifying.current = false;
    }
  }

  function writeOtpDigit(index: number, input: string) {
    const digit = latinDigits(input).slice(-1);
    const next = [...otpCode];
    next[index] = digit;
    setOtpCode(next);
    setTabError(null);
    if (digit && index < 5) otpInputs.current[index + 1]?.focus();
    if (next.every(Boolean)) void verifyOtp(next.join(""));
  }

  function onOtpKey(index: number, event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !otpCode[index] && index > 0) otpInputs.current[index - 1]?.focus();
  }

  function onOtpPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = latinDigits(event.clipboardData.getData("text")).slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    const next = Array.from({ length: 6 }, (_, index) => pasted[index] ?? "");
    setOtpCode(next);
    otpInputs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) void verifyOtp(pasted);
  }

  /** The single pay click: hold → account (or existing-route) → policy → commit. */
  async function checkout(): Promise<void> {
    if (busy || startMin === null) return;
    if (hold && hold.left < 1) {
      setHold(null);
      await waitForHold(user ? undefined : localMobile(guestPhone) || undefined);
      return;
    }
    if (!reviewPlan) {
      toast.push("زمان انتخابی معتبر نیست؛ یک ساعت دیگر انتخاب کنید.", "error");
      setStep(2);
      return;
    }
    let activeUser = user;
    let displayName = user?.name ?? "";
    if (!activeUser) {
      if (checkoutTab !== "guest") {
        setTabError("برای ادامه اول با کد پیامکی وارد شو، یا به تب «مشتری جدید» برو.");
        return;
      }
      const nameClean = guestName.trim();
      const mobile = localMobile(guestPhone);
      if (nameClean.length < 2) { setTabError("نام کامل را وارد کن."); return; }
      if (!/^09\d{9}$/.test(mobile)) { setTabError("شمارهٔ موبایل ۱۱ رقمی و با ۰۹ شروع شود."); return; }
      setTabError(null);
      setBusy(true);
      try {
        const response = await fetch("/api/auth/guest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone: mobile, name: nameClean }),
        });
        const result: { ok?: boolean; existing?: boolean; error?: string; user?: AuthUser } = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error ?? "ساخت حساب کاربری انجام نشد.");
        if (result.existing) {
          setLoginPhone(mobile);
          setCheckoutTab("login");
          setOtpStage("phone");
          setTabError("این شماره قبلاً ثبت‌نام کرده است؛ برای حفظ نوبتت با کد پیامکی وارد شو.");
          return;
        }
        if (!result.user) throw new Error("ساخت حساب کاربری انجام نشد.");
        activeUser = result.user;
        displayName = result.user.name;
        setUser(result.user);
        // guest accounts start unaccepted on the CURRENT policy version
        setPolicyAccepted(false);
      } catch (err) {
        setTabError(err instanceof Error ? err.message : "ساخت حساب کاربری انجام نشد. دوباره تلاش کنید.");
        return;
      } finally {
        setBusy(false);
      }
    }
    if (!hold || hold.left < 1) {
      const held = await waitForHold(activeUser ? undefined : localMobile(guestPhone) || undefined);
      if (!held) return;
    }
    if (!policyAccepted) {
      setPolicyOpen(true);
      return; // sheet's onAccept continues into submit()
    }
    await submit(displayName || guestName.trim());
  }

  async function acceptPolicyAndContinue(): Promise<void> {
    setPolicyAccepted(true);
    setPolicyOpen(false);
    if (!hold || hold.left < 1) {
      const held = await waitForHold(user ? undefined : localMobile(guestPhone) || undefined);
      if (!held) return;
    }
    await submit(user?.name ?? guestName.trim());
  }

  function toggleServiceSelection(id: number) {
    setSwapNote(null);
    const current = selected;
    const mine = current[activeAttendee] ?? [];
    if (mine.includes(id)) {
      setSelected({ ...current, [activeAttendee]: mine.filter((x) => x !== id) });
      return;
    }
    if (mine.length >= 12) {
      toast.push("حداکثر ۱۲ خدمت برای هر نفر در یک نوبت.", "error");
      return;
    }
    const blockers = conflictingSelected(id, mine);
    if (blockers.length === 0) {
      setSelected({ ...current, [activeAttendee]: [...mine, id] });
      return;
    }
    // Auto-swap instead of blocking: the newer intent wins, the dropped
    // service and the salon's own reason are stated right above the list.
    // (never side effects inside a state updater — React warns on this)
    const nameOf = (serviceId: number) => servicesList.find((s) => s.id === serviceId)?.name ?? `سرویس ${serviceId}`;
    const dropped = blockers.map((x) => `«${nameOf(x)}»`).join(" و ");
    const reason = conflictReason(id, blockers);
    const note = `«${nameOf(id)}» انتخاب شد و ${dropped} از انتخاب خارج شد${reason ? ` — ${reason}` : ""}.`;
    setSwapNote(note);
    toast.push(note, "warning");
    const kept = mine.filter((x) => !blockers.includes(x));
    setSelected({ ...current, [activeAttendee]: [...kept, id] });
  }

  function resetAll() {
    setSelected(initialServiceId ? { primary: [initialServiceId] } : {});
    setCompanions([]);
    setActiveAttendee("primary");
    setDate(todayISO());
    setStartMin(null);
    setGroupPins({});
    setHold(null);
    setHoldError(null);
    setSwapNote(null);
    setTabError(null);
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
          <ol className="mt-6 space-y-2 text-start">
            {visit.segments.map((segment, index) => (
              <li key={`${segment.serviceId}-${index}`} className="rounded-[14px] bg-[var(--color-surface-sunken)] p-3 text-sm">
                <p className="font-bold">
                  {segment.serviceName}
                  <span className="me-2 font-mono text-xs font-normal text-[var(--color-text-muted)]">
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
            {receipt.remainingDue > 0 && <span className={receipt.amountDueOnline > 0 ? "me-3 text-[var(--color-text-muted)]" : ""}>مانده در سالن: {formatPrice(receipt.remainingDue)}</span>}
          </p>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">حساب کاربری تو با همین شمارهٔ موبایل ساخته/به‌روزرسانی شد؛ از «نوبت‌های من» پیگیری کن.</p>
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
  const remaining = Math.max(0, Math.ceil((cooldownUntil - clock) / 1000));
  const loginMobileValid = /^09\d{9}$/.test(localMobile(loginPhone));
  const barberNames = barberGroups
    .map((group) => (activePins[group.key] !== undefined ? barbersList.find((b) => b.id === activePins[group.key])?.name ?? null : null))
    .filter((n): n is string => n !== null);
  const uniqueBarberNames = [...new Set(barberNames)];
  const barberLabel = uniqueBarberNames.length === 0
    ? "هر آرایشگری — خودکار"
    : uniqueBarberNames.join(" و ") + (barberGroups.every((group) => activePins[group.key] !== undefined) ? "" : " · بقیه خودکار");

  return (
    <div className="mx-auto max-w-[720px] px-4 pb-40 pt-5 sm:px-6 sm:pb-32 sm:pt-9">
      <BookingPolicySheet isOpen={policyOpen} onClose={() => setPolicyOpen(false)} onAccept={() => void acceptPolicyAndContinue()} version={policyVersion} items={policyItems} />

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
                    {count > 0 && <span className="me-1.5 rounded-full bg-[var(--color-accent-soft)] px-1.5 text-xs text-[var(--color-action-primary)]">{persianNum(count)}</span>}
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
            <Icon name="search" className="pointer-events-none absolute start-4 top-3.5 h-5 w-5 text-[var(--color-text-muted)]" />
            <input id="service-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="مثلاً فید یا طراحی ریش" className="ui-input ps-11" />
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
            خدمات متضاد هم خودکار جابه‌جا می‌شوند: انتخاب خدمت جدید، خدمت قبلیِ در تضاد را از لیست بیرون می‌اندازد.
          </p>

          {swapNote && (
            <p role="status" data-swap-note className="mt-3 flex items-start justify-between gap-2 rounded-[14px] bg-[var(--color-warning-soft)] p-3 text-xs leading-6 text-[var(--color-warning)]">
              <span>{swapNote}</span>
              <button type="button" aria-label="بستن پیام جابه‌جایی" onClick={() => setSwapNote(null)} className="focus-ring shrink-0 font-black">×</button>
            </p>
          )}

          <div className="mt-4 space-y-2">
            {filteredServices.length ? (
              filteredServices.map((item) => {
                const isOn = activeIds.includes(item.id);
                const notOffered = !offeredServiceIds.has(item.id);
                const wouldDrop = notOffered ? [] : conflictingSelected(item.id, activeIds).filter((x) => x !== item.id);
                const willSwap = !isOn && wouldDrop.length > 0;
                const swapName = willSwap ? `با انتخاب این خدمت، ${wouldDrop.map((x) => `«${servicesList.find((s) => s.id === x)?.name ?? ""}»`).join(" و ")} از انتخاب خارج می‌شود.` : "";
                return (
                  <div key={item.id} className={`bk-row ${isOn ? "bk-row-on" : ""} ${notOffered ? "bk-row-disabled" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <strong className="block text-[15px] font-bold">{item.name}</strong>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {persianNum(item.durationMin)} دقیقه · {formatPrice(item.basePrice)}
                      </p>
                      {notOffered && <p className="mt-1.5 text-xs font-semibold text-[var(--color-warning)]">این خدمت فعلاً توسط آرایشگران سالن ارائه نمی‌شود.</p>}
                      {willSwap && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[var(--color-warning)]">
                          <Icon name="scissors" className="h-3 w-3" />
                          {swapName}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      disabled={notOffered}
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
              <button type="button" onClick={() => { setSwapNote(null); setStep(1); }} className="ui-button shrink-0 !min-h-11 !px-6">
                انتخاب آرایشگر
              </button>
            </div>
          )}
        </section>
      )}

      {/* ============ STEP 1 — barber (BEFORE the time, so the grid shows what they actually offer) ============ */}
      {step === 1 && (
        <section aria-labelledby="barber-title">
          <div className="ui-pagehead">
            <h1 id="barber-title">با چه آرایشگری؟</h1>
            <p>
              {persianNum(primaryIds.length)} خدمت انتخابی — برای هر گروه یک نفر را بردار یا بگذار سالن بهترین چیدمان را بچیند.
            </p>
          </div>

          {barberGroups.length === 0 ? (
            <div className="ui-panel text-sm leading-7 text-[var(--color-text-muted)]">اول از مرحلهٔ قبل یک خدمت انتخاب کن.</div>
          ) : (
            <div className="mt-4 space-y-4">
              {barberGroups.map((group) => {
                const names = group.serviceIds.map((id) => servicesList.find((x) => x.id === id)?.name ?? "خدمت");
                const groupLabel = names.join(" و ");
                const auto = activePins[group.key] === undefined;
                const pinFor = (barber: BookingBarberItem) =>
                  group.serviceIds.every((id) => barber.serviceIds.includes(id));
                return (
                  <div key={group.key} className="ui-panel !p-0" data-barber-group={group.key}>
                    <div className="flex items-baseline justify-between gap-2 border-b border-[var(--color-hairline)] px-4 py-3">
                      <strong className="text-sm font-black">{groupLabel}</strong>
                      {group.serviceIds.length > 1 && (
                        <span className="shrink-0 rounded-pill bg-[var(--color-surface-sunken)] px-2.5 py-0.5 text-[10px] font-black text-[var(--color-text-muted)]">
                          یک آرایشگر برای همه
                        </span>
                      )}
                    </div>
                    <div role="group" aria-label={`انتخاب آرایشگر برای ${groupLabel}`} className="divide-y divide-[var(--color-hairline)]">
                      <button
                        type="button"
                        data-barber-card="any"
                        onClick={() => setGroupPins((previous) => ({ ...previous, [group.key]: null }))}
                        aria-pressed={auto}
                        className={`bk-row w-full text-start ${auto ? "bk-row-on" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <strong className="block text-[15px] font-bold">خودکار — سالن بچیند</strong>
                          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                            بهترین زمان با هر آرایشگری که این {group.serviceIds.length > 1 ? "گروه را کامل" : "خدمت"} را پوشش بدهد.
                          </p>
                        </div>
                        {auto && <span className="shrink-0 rounded-pill bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-black text-[var(--color-action-primary)]">انتخاب سیستم</span>}
                      </button>
                      {barbersList.map((barber) => {
                        const eligible = pinFor(barber);
                        const evaluation = barberEvaluation(barber, group.serviceIds);
                        const isOn = activePins[group.key] === barber.id;
                        return (
                          <button
                            key={barber.id}
                            type="button"
                            data-barber-card={barber.slug ?? barber.id}
                            onClick={() =>
                              eligible
                                ? setGroupPins((previous) => ({ ...previous, [group.key]: isOn ? null : barber.id }))
                                : undefined
                            }
                            aria-pressed={isOn}
                            disabled={!eligible}
                            className={`bk-row w-full text-start ${isOn ? "bk-row-on" : ""} ${!eligible ? "bk-row-disabled" : ""}`}
                          >
                            <div className="min-w-0 flex-1">
                              <strong className="block text-[15px] font-bold">{barber.name}</strong>
                              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{barber.title || "پیرایش مردانه"}</p>
                              <p className={`mt-1.5 text-xs font-semibold ${eligible ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>{evaluation.reason}</p>
                            </div>
                            {isOn && <span className="shrink-0 rounded-pill bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-black text-[var(--color-action-primary)]">انتخاب تو</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-3 text-xs leading-6 text-[var(--color-text-muted)]">
            خدماتی که به هم گره خورده‌اند (مثل مو و ریش) یک گروه‌اند و حتماً یک نفر انجامشان می‌دهد؛ برای گروه‌های دیگر می‌توانی آرایشگر جدا برداری — باز هم همه در یک نوبت پشت‌سرهم، با یک ساعت شروع.
          </p>

          <div className="safe-bottom bk-sticky">
            <div className="min-w-0">
              <p className="text-sm font-black">{barberLabel}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">زمان‌های آزاد بعداً بر همین اساس نشان داده می‌شود</p>
            </div>
            <button type="button" onClick={() => setStep(2)} className="ui-button shrink-0 !min-h-11 !px-6">انتخاب زمان</button>
          </div>
        </section>
      )}

      {/* ============ STEP 2 — date & single start time ============ */}
      {step === 2 && (
        <section aria-labelledby="time-title">
          <div className="ui-pagehead">
            <h1 id="time-title">کِی میایید؟</h1>
            <p>
              یک ساعت شروع برای کل {persianNum(selectionCount)} خدمت ·{" "}
              <button type="button" onClick={() => setStep(1)} className="focus-ring font-black text-[var(--color-action-primary)] underline underline-offset-2">
                {barberLabel}
              </button>
            </p>
          </div>

          <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="انتخاب روز">
            {dates.map((item, index) => {
              const label = index === 0 ? "امروز" : index === 1 ? "فردا" : new Intl.DateTimeFormat("fa-IR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${item}T00:00:00Z`));
              const dayNum = new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${item}T00:00:00Z`));
              const selected2 = item === date;
              return (
                <button key={item} type="button" onClick={() => { setDate(item); setStartMin(null); }} aria-pressed={selected2} className={`focus-ring bk-day ${selected2 ? "bk-day-on" : ""}`}>
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
                برای {formatPersianDate(date)} {hasPinnedBarber ? `ساعت آزایی با ${barberLabel} پیدا نشد` : "زمان آزادی که کل این خدمات را پوشش بدهد پیدا نشد"}. روز دیگری را امتحان کنید{hasPinnedBarber ? " یا آرایشگر گروه‌ها را عوض کنید" : ""}؛ خدمات را هم می‌توان کم کرد.
              </div>
            ) : (
              <TimeGrid
                validStarts={validStarts}
                selected={startMin}
                onPick={(minute) => {
                  setStartMin(minute);
                  setHold(null);
                  setHoldError(null);
                  setStep(3);
                }}
              />
            )}
          </div>
        </section>
      )}

      {/* ============ STEP 3 — review, identity & commit ============ */}
      {step === 3 && (
        <section aria-labelledby="summary-title">
          <div className="ui-pagehead">
            <h1 id="summary-title">بازبینی و ثبت</h1>
            <p>آخرین نگاه؛ مجموع هزینه پایین همین صفحه است. ورود یا ساخت حساب هم فقط همین‌جا پرسیده می‌شود.</p>
          </div>

          {user ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
              <p>رزرو برای <strong>{user.name}</strong> <span dir="ltr" className="font-semibold text-[var(--color-text-muted)]">{user.phone}</span></p>
              <button type="button" onClick={() => setStep(2)} className="focus-ring min-h-11 shrink-0 text-xs font-bold text-[var(--color-action-primary)]">تغییر زمان</button>
            </div>
          ) : (
            <div className="mb-4 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div role="tablist" data-checkout-tabs aria-label="نوع حساب کاربری" className="flex gap-2">
                <button
                  type="button"
                  role="tab"
                  data-checkout-tab="guest"
                  aria-selected={checkoutTab === "guest"}
                  onClick={() => { setCheckoutTab("guest"); setTabError(null); }}
                  className={`focus-ring ui-pill min-h-11 flex-1 !px-3 text-sm font-bold ${checkoutTab === "guest" ? "bg-[var(--color-action-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}
                >
                  مشتری جدید
                </button>
                <button
                  type="button"
                  role="tab"
                  data-checkout-tab="login"
                  aria-selected={checkoutTab === "login"}
                  onClick={() => { setCheckoutTab("login"); setTabError(null); }}
                  className={`focus-ring ui-pill min-h-11 flex-1 !px-3 text-sm font-bold ${checkoutTab === "login" ? "bg-[var(--color-action-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}
                >
                  قبلاً ثبت‌نام کرده‌ام
                </button>
              </div>

              {checkoutTab === "guest" ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs leading-6 text-[var(--color-text-muted)]">
                    فقط نام و شماره؛ با زدن «ثبت رزرو و پرداخت» حساب شما خودکار ساخته می‌شود و نوبت در «نوبت‌های من» پیگیری خواهد بود — بدون کد پیامکی برای بار اول.
                  </p>
                  <div>
                    <label className="ui-label" htmlFor="guest-name">نام کامل</label>
                    <input id="guest-name" value={guestName} onChange={(e) => { setGuestName(e.target.value); setTabError(null); }} autoComplete="name" placeholder="مثلاً نیما رستگاری" className="ui-input" />
                  </div>
                  <div>
                    <label className="ui-label" htmlFor="guest-phone">شماره تلفن همراه</label>
                    <input id="guest-phone" dir="ltr" inputMode="tel" value={guestPhone} onChange={(e) => { setGuestPhone(e.target.value); setTabError(null); }}
                       onBlur={(e) => { const v = localMobile(e.target.value); if (v && /^09\d{9}$/.test(v) && hold?.keyedBy === "anon") void waitForHold(v); }}
                       autoComplete="tel" placeholder="0912 345 6789" className="ui-input text-left" />
                  </div>
                </div>
              ) : otpStage === "phone" ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs leading-6 text-[var(--color-text-muted)]">
                    شماره‌ای که قبلاً با آن ثبت‌نام کرده‌ای را وارد کن؛ کد پیامکی می‌آید و بعد از کد، مستقیم همین صفحه پرداخت می‌شود.
                  </p>
                  <div>
                    <label className="ui-label" htmlFor="login-phone">شماره تلفن همراه</label>
                    <input id="login-phone" dir="ltr" inputMode="tel" value={loginPhone} onChange={(e) => { setLoginPhone(e.target.value); setTabError(null); }} autoComplete="tel" placeholder="0912 345 6789" className="ui-input text-left" />
                    {demoPhoneHint && <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">دمو: {demoPhoneHint}</p>}
                  </div>
                  <button type="button" onClick={() => void sendOtp()} disabled={!loginMobileValid || busy} className="ui-button w-full !min-h-11">
                    دریافت کد ورود
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm leading-6">
                    کد ۶ رقمی برای <strong dir="ltr">{localMobile(loginPhone)}</strong> پیامک شد.
                    {previewCode && <button type="button" onClick={() => { const fill = previewCode.slice(0, 6).split(""); setOtpCode(fill.concat(Array(6 - fill.length).fill("")).slice(0, 6)); if (fill.length === 6) void verifyOtp(fill.join("")); }} className="focus-ring me-2 rounded-pill bg-[var(--color-accent-soft)] px-2 text-xs font-bold text-[var(--color-action-primary)]">کد دمو: {previewCode}</button>}
                  </p>
                  <div dir="ltr" role="group" aria-label="شش رقم کد تأیید" className="flex justify-center gap-2">
                    {otpCode.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => { otpInputs.current[index] = el; }}
                        value={digit}
                        onChange={(e) => writeOtpDigit(index, e.target.value)}
                        onKeyDown={(e) => onOtpKey(index, e)}
                        onPaste={onOtpPaste}
                        inputMode="numeric"
                        maxLength={2}
                        aria-label={`رقم ${persianNum(index + 1)} کد`}
                        className="focus-ring h-12 w-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-center text-lg font-black tabular-nums"
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void sendOtp()}
                      disabled={remaining > 0 || busy}
                      className="focus-ring min-h-11 text-xs font-bold text-[var(--color-action-primary)] disabled:text-[var(--color-text-muted)]"
                    >
                      {remaining > 0 ? `ارسال دوباره تا ${persianNum(remaining)} ثانیه` : "ارسال دوبارهٔ کد"}
                    </button>
                    <button type="button" onClick={() => { setOtpStage("phone"); setTabError(null); }} className="focus-ring min-h-11 text-xs font-bold text-[var(--color-text-muted)] underline">
                      شماره را عوض می‌کنم
                    </button>
                  </div>
                </div>
              )}

              {tabError && <p role="alert" data-tab-error className="mt-3 text-xs font-bold leading-6 text-[var(--color-danger)]">{tabError}</p>}
            </div>
          )}

          {hold && (
            <div role="status" aria-live="polite" className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[16px] border p-4 text-sm font-semibold ${hold.left > 0 ? "border-[var(--color-accent-line)] bg-[var(--color-accent-soft)] text-[var(--color-action-primary)]" : "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] text-[var(--color-danger)]"}`}>
              <span>{hold.left > 0 ? "این زمان برای کل نوبت شما قفل شده — تا پایان این مهلت هیچ‌کس نمی‌تواند آن را بگیرد." : "مهلت نگه‌داشتن تمام شد؛ با همان اطلاعات، زمان دوباره گرفته می‌شود."}</span>
              <span dir="ltr" className="font-mono text-lg tabular-nums">
                {String(Math.floor(hold.left / 60)).padStart(2, "0")}:{String(hold.left % 60).padStart(2, "0")}
              </span>
            </div>
          )}
          {!hold && !user && reviewPlan && (
            <p className="mb-4 rounded-[16px] bg-[var(--color-accent-soft)] p-4 text-sm leading-7 text-[var(--color-text-secondary)]">
              همین‌جا این ساعت برای ۱۰ دقیقه برای شما قفل می‌شود و تا قبل از پرداخت، هیچ‌کس نمی‌تواند رزروش کند.
            </p>
          )}

          {holdError && (
            <div role="alert" className="mb-4 rounded-[16px] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] p-4 text-sm leading-7 text-[var(--color-danger)]">
              {holdError.message}
              {nearbyStarts.length > 0 && (
                <>
                  <p className="mt-2 text-xs font-bold text-[var(--color-text-secondary)]">نزدیک‌ترین زمان‌های آزاد:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {nearbyStarts.map((minute) => (
                      <button key={minute} type="button" onClick={() => { setStartMin(minute); setHold(null); setHoldError(null); }} className="focus-ring min-h-11 rounded-xl bg-[var(--color-accent-soft)] px-4 text-sm font-bold text-[var(--color-action-primary)]">
                        {minutesToLabel(minute)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {planLoading ? (
            <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-[20px] bg-[var(--color-surface-sunken)]" />)}</div>
          ) : !reviewPlan ? (
            <div className="ui-panel">
              <p className="text-sm leading-7 text-[var(--color-text-muted)]">
                {planError ?? planValue?.issues?.[0]?.message ??
                  (hasPinnedBarber
                    ? `${barberLabel} در این ساعت برای کل این خدمات آزاد نیست.`
                    : "این ساعت پر شده است.")}
              </p>
              {nearbyStarts.length > 0 && (
                <>
                  <p className="mt-3 text-xs font-bold text-[var(--color-text-secondary)]">نزدیک‌ترین زمان‌های آزاد:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {nearbyStarts.map((minute) => (
                      <button key={minute} type="button" onClick={() => { setStartMin(minute); setHold(null); setHoldError(null); }} className="focus-ring min-h-11 rounded-xl bg-[var(--color-accent-soft)] px-4 text-sm font-bold text-[var(--color-action-primary)]">
                        {minutesToLabel(minute)}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button type="button" onClick={() => setStep(2)} className="focus-ring mt-4 min-h-11 text-sm font-bold text-[var(--color-action-primary)] underline">
                انتخاب زمان دیگر
              </button>
            </div>
          ) : (
            <div className={`ui-panel ${staffPlan.stale ? "opacity-70" : ""}`}>
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-black">
                  {formatPersianDate(reviewPlan.date)} · {minutesToLabel(reviewPlan.startMin)}–{minutesToLabel(reviewPlan.endMin)}
                  <span className="me-2 rounded-pill bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-action-primary)]">یک نوبت · {persianNum(reviewPlan.totalMinutes)} دقیقه</span>
                </span>
                <button type="button" onClick={() => setStep(2)} className="focus-ring text-xs font-bold text-[var(--color-action-primary)] underline">ویرایش</button>
              </p>
              <ol className="mt-4 space-y-2">
                {reviewPlan.segments.map((segment, index) => (
                  <li key={`${segment.serviceId}-${index}`} className="bk-seg">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{segment.serviceName}
                        {segment.attendeeId !== "primary" && <span className="me-2 text-xs font-normal text-[var(--color-text-muted)]">برای {companions.find((c) => c.id === segment.attendeeId)?.name ?? "همراه"}</span>}
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
              {reviewPlan.distinctBarbers > 1 && (
                <p className="mt-3 rounded-[14px] bg-[var(--color-surface-sunken)] p-3 text-xs leading-6 text-[var(--color-text-muted)]">
                  این خدمات بین {persianNum(reviewPlan.distinctBarbers)} آرایشگر تقسیم شده است؛ شما یک نوبت دارید، نه چند نوبت.
                </p>
              )}
              {reviewPlan.requiresManagerApproval && (
                <p className="mt-3 text-xs font-semibold text-[var(--color-warning)]">این نوبت پس از ثبت نیازمند تأیید مدیر سالن است.</p>
              )}
              <div className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-3 text-sm">
                <VisitSummaryRow label="مبلغ خدمات" value={formatPrice(reviewPlan.totalPrice)} />
                {reviewPlan.amountDueOnline > 0 && <VisitSummaryRow label={reviewPlan.segments.some((s) => s.paymentMode === "FULL_PAYMENT") ? "پرداخت آنلاین" : "بیعانه آنلاین"} value={formatPrice(reviewPlan.amountDueOnline)} />}
                <VisitSummaryRow label="مانده در سالن" value={formatPrice(reviewPlan.remainingDue)} />
              </div>
            </div>
          )}

          <p className="mt-4 text-xs leading-6 text-[var(--color-text-muted)]">
            مبلغ نهایی و آزاد بودن زمان در سرور دوباره بررسی می‌شود؛ نوبت دارای بیعانه پس از تأیید پرداخت قطعی خواهد شد.
            پیش از ثبت، «نکات مهم رزرو» را یک‌بار می‌پذیری و در حساب ثبت می‌شود.
          </p>

          <div className="safe-bottom bk-sticky">
            <div className="min-w-0">
              <p className="text-sm font-black">مجموع: {reviewPlan ? formatPrice(reviewPlan.totalPrice) : "—"}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {reviewPlan && reviewPlan.amountDueOnline > 0 ? `پرداخت آنلاین: ${formatPrice(reviewPlan.amountDueOnline)}` : "پرداخت در سالن"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void checkout()}
              disabled={busy || !reviewPlan}
              className="ui-button shrink-0 !min-h-11 !px-6"
            >
              {busy
                ? "در حال ثبت…"
                : hold && hold.left < 1
                  ? "مهلت تمام شد — نگه‌داشتن دوباره"
                  : !user && checkoutTab === "login" && otpStage === "phone"
                    ? "ابتدا با کد وارد شو"
                    : reviewPlan && reviewPlan.amountDueOnline > 0
                      ? "ثبت رزرو و پرداخت"
                      : "تأیید و ثبت نوبت"}
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
