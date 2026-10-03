"use client";

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

export type BookingServiceItem = { id: number; slug?: string; name: string; category: string; durationMin: number; basePrice: number; description: string; paymentMode: "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT"; depositAmount: number };
export type BookingBarberItem = { id: number; slug?: string; name: string; title: string; serviceIds: number[] };

const slotSchema = z.object({ startMin: z.number(), endMin: z.number() });
const barberSchema = z.object({
  id: z.number(), name: z.string(), slug: z.string(), title: z.string(),
  specialization: z.string(), rating: z.number().nullable(), reviewCount: z.number(),
  resolvedPrice: z.number(), durationMin: z.number(), barberDurationMin: z.number(), bufferMin: z.number(), isExactAvailable: z.boolean(),
  exactSlot: slotSchema.nullable(), nearbySlots: z.array(slotSchema), allAvailableSlots: z.array(slotSchema),
});
const availabilitySchema = z.object({ barbers: z.array(barberSchema), recoverySlots: z.array(z.object({ startMin: z.number(), barberCount: z.number() })) });
const holdSchema = z.object({ expiresAt: z.string(), error: z.string().optional() });
const receiptSchema = z.object({ appointmentId: z.number().int().positive(), paymentReference: z.string().nullable(), amountDueOnline: z.number(), remainingDue: z.number(), paymentMode: z.enum(["NO_PAYMENT", "DEPOSIT", "FULL_PAYMENT"]) });
const groupReceiptSchema = z.object({
  appointmentIds: z.array(z.number().int().positive()).min(1),
  paymentReference: z.string().nullable(),
  amountDueOnline: z.number(),
  remainingDue: z.number(),
});
type AvailableBarber = z.infer<typeof barberSchema>;
type Availability = z.infer<typeof availabilitySchema>;
type Step = 0 | 1 | 2 | 3 | 4;
type GroupBookingItem = {
  attendeeId: string;
  attendeeName: string;
  serviceId: number;
  serviceName: string;
  barberId: number;
  barberName: string;
  date: string;
  startMin: number;
  durationMin: number;
  barberDurationMin: number;
  bufferMin: number;
  price: number;
  amountDueOnline: number;
  remainingDue: number;
};
type BookingReceiptItem = Pick<GroupBookingItem, "attendeeName" | "serviceName" | "barberName" | "date" | "startMin" | "durationMin" | "remainingDue"> & { id: number };
const groups = [
  { label: "صبح", start: 0, end: 720 }, { label: "ظهر", start: 720, end: 900 },
  { label: "عصر", start: 900, end: 1140 }, { label: "شب", start: 1140, end: 1440 },
];
const stageLabels = ["خدمت", "زمان", "آرایشگر", "بازبینی"];

function persianDay(date: string): string {
  return new Intl.DateTimeFormat("fa-IR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
function persianDayNumber(date: string): string {
  return new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
function normalizeQuery(value: string): string { return value.trim().replace(/ي/g, "ی").replace(/ك/g, "ک"); }

export function CustomerBooking({ servicesList, barbersList, initialUser, initialServiceId, initialBarberId, initialDate, initialStartMin, policyVersion, policyItems, demoPhoneHint }: {
  servicesList: BookingServiceItem[];
  barbersList: BookingBarberItem[];
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
  const [user, setUser] = useState(initialUser);
  const [authOpen, setAuthOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [step, setStep] = useState<Step>(initialServiceId ? initialStartMin !== undefined ? 2 : 1 : 0);
  const [serviceId, setServiceId] = useState<number | null>(initialServiceId ?? null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>(initialServiceId ? [initialServiceId] : []);
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [time, setTime] = useState<number | null>(initialStartMin ?? null);
  const [selectedBarberId, setSelectedBarberId] = useState<number | null>(initialBarberId ?? null);
  const [barberFilter, setBarberFilter] = useState<number | null>(initialBarberId ?? null);
  const [category, setCategory] = useState("همه");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{ key: string; value: Availability | null; error: string | null }>({ key: "", value: null, error: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [hold, setHold] = useState<{ expiry: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupItems, setGroupItems] = useState<GroupBookingItem[]>([]);
  const [companions, setCompanions] = useState<{ id: string; name: string }[]>([]);
  const [attendeeId, setAttendeeId] = useState("primary");
  const [newCompanionName, setNewCompanionName] = useState("");
  const [receipt, setReceipt] = useState<{ id: number; reference: string | null; amountDueOnline: number; remainingDue: number; appointments: BookingReceiptItem[] } | null>(null);
  const attendeeName = attendeeId === "primary" ? user?.name ?? "" : companions.find((item) => item.id === attendeeId)?.name ?? "";
  const requestId = useRef(0);
  const chosenService = servicesList.find((item) => item.id === serviceId);
  const queryKey = `${serviceId}:${date}:${step === 1 ? "all" : time ?? "all"}:${barberFilter ?? "all"}:${refreshKey}`;
  const availabilityLoading = Boolean(serviceId) && step >= 1 && step <= 2 && data.key !== queryKey;
  const available = data.key === queryKey ? data.value : null;
  const availabilityError = data.key === queryKey ? data.error : null;
  const availableBarbers = useMemo(() => (available?.barbers ?? []).map((barber) => {
    const conflictsWithPlan = (startMin: number) => groupItems.some((item) =>
      item.date === date &&
      item.barberId === barber.id &&
      startMin < item.startMin + item.barberDurationMin + item.bufferMin &&
      item.startMin < startMin + barber.barberDurationMin + barber.bufferMin,
    );
    return {
      ...barber,
      isExactAvailable: barber.isExactAvailable && time !== null && !conflictsWithPlan(time),
      nearbySlots: barber.nearbySlots.filter((slot) => !conflictsWithPlan(slot.startMin)),
      allAvailableSlots: barber.allAvailableSlots.filter((slot) => !conflictsWithPlan(slot.startMin)),
    };
  }), [available, groupItems, date, time]);
  const selectedBarber = availableBarbers.find((item) => item.id === selectedBarberId);
  const nextServiceId = selectedServiceIds.find((id) =>
    id !== serviceId && !groupItems.some((item) => item.attendeeId === attendeeId && item.serviceId === id),
  );
  const dates = useMemo(() => {
    const result = Array.from({ length: 14 }, (_, index) => addDaysISO(todayISO(), index));
    if (initialDate && !result.includes(initialDate)) result.push(initialDate);
    return result.sort();
  }, [initialDate]);
  const categories = useMemo(() => ["همه", ...new Set(servicesList.map((item) => item.category).filter(Boolean))], [servicesList]);
  const filteredServices = servicesList.filter((item) => (category === "همه" || category === item.category) && normalizeQuery(`${item.name} ${item.description}`).includes(normalizeQuery(search)));
  const availableTimes = useMemo(() => [...new Set(availableBarbers.flatMap((b) => b.allAvailableSlots.map((s) => s.startMin)))].sort((a, b) => a - b), [availableBarbers]);
  const canPickBarber = Boolean(availableBarbers.some((b) => b.id === selectedBarberId && b.isExactAvailable));
  useEffect(() => {
    if (!initialUser) return;
    let cancelled = false;
    void fetch("/api/auth/me", { cache: "no-store" }).then((res) => res.json()).then((result: { policyAccepted?: boolean }) => { if (!cancelled) setPolicyAccepted(Boolean(result.policyAccepted)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [initialUser]);

  useEffect(() => {
    if (!serviceId || step < 1 || step > 2) return;
    const controller = new AbortController();
    const serial = ++requestId.current;
    const params = new URLSearchParams({ serviceId: String(serviceId), date });
    if (step === 2 && time !== null) params.set("time", String(time));
    if (barberFilter) params.set("barberId", String(barberFilter));
    void fetch(`/api/booking/available-barbers?${params}`, { signal: controller.signal, cache: "no-store" }).then(async (res) => {
      const json: unknown = await res.json();
      if (!res.ok) throw new Error(z.object({ error: z.string().optional() }).safeParse(json).data?.error ?? "زمان‌های آزاد دریافت نشدند.");
      const parsed = availabilitySchema.safeParse(json);
      if (!parsed.success) throw new Error("پاسخ زمان‌بندی معتبر نیست؛ دوباره تلاش کنید.");
      if (serial === requestId.current && !controller.signal.aborted) setData({ key: queryKey, value: parsed.data, error: null });
    }).catch((error: unknown) => {
      if (serial === requestId.current && !controller.signal.aborted) setData({ key: queryKey, value: null, error: error instanceof Error ? error.message : "دریافت زمان‌ها ممکن نشد." });
    });
    return () => controller.abort();
  }, [serviceId, date, time, step, barberFilter, refreshKey, queryKey]);
  const holdExpiry = hold?.expiry;
  useEffect(() => {
    if (step !== 3 || !holdExpiry) return;
    const timer = window.setInterval(() => setHold((previous) => previous ? { ...previous, left: Math.max(0, Math.ceil((previous.expiry - Date.now()) / 1000)) } : null), 1000);
    return () => window.clearInterval(timer);
  }, [step, holdExpiry]);

  const waitForHold = useCallback(async (authenticatedUser = user) => {
    const identity = authenticatedUser
      ? { name: authenticatedUser.name, phone: authenticatedUser.phone }
      : null;
    if (!identity || !chosenService || !selectedBarber || time === null || busy) return;
    setBusy(true);
    try {
      const currentItem = {
        attendeeId,
        barberId: selectedBarber.id,
        serviceId: chosenService.id,
        date,
        startMin: time,
      };
      const items = [...groupItems.map(({ attendeeId: id, barberId, serviceId, date: itemDate, startMin }) => ({
        attendeeId: id,
        barberId,
        serviceId,
        date: itemDate,
        startMin,
      })), currentItem];
      const response = await fetch("/api/booking/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(groupItems.length ? { items } : currentItem),
      });
      const json: unknown = await response.json();
      const result = holdSchema.safeParse(json);
      if (!response.ok || !result.success) throw new Error(z.object({ error: z.string().optional() }).safeParse(json).data?.error ?? "این زمان دیگر آزاد نیست؛ گزینهٔ دیگری انتخاب کنید.");
      const expiry = new Date(result.data.expiresAt).getTime();
      setHold({ expiry, left: Math.max(0, Math.ceil((expiry - Date.now()) / 1000)) });
      setStep(3);
    } catch (error) {
      setStep(2);
      setSelectedBarberId(null);
      setRefreshKey((current) => current + 1);
      toast.push(error instanceof Error ? error.message : "نگهداری زمان انجام نشد.", "error");
    } finally { setBusy(false); }
  }, [user, chosenService, selectedBarber, time, busy, date, toast, attendeeId, groupItems]);

  async function continueFromBarber() {
    if (!canPickBarber || busy) return;
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!policyAccepted) setPolicyOpen(true);
    else await waitForHold(user);
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
      if (accepted) await waitForHold(signedIn);
      else setPolicyOpen(true);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "ادامه رزرو ممکن نشد.", "error");
    }
  }

  async function submit() {
    const identity = user
      ? { name: user.name, phone: user.phone }
      : null;
    if (!chosenService || !selectedBarber || time === null || !identity || !hold || hold.left < 1 || busy) return;
    setBusy(true);
    try {
      if (groupItems.length > 0 || attendeeId !== "primary") {
        const items = [
          ...groupItems,
          {
            attendeeId,
            attendeeName,
            serviceId: chosenService.id,
            serviceName: chosenService.name,
            barberId: selectedBarber.id,
            barberName: selectedBarber.name,
            date,
            startMin: time,
            durationMin: selectedBarber.durationMin,
            barberDurationMin: selectedBarber.barberDurationMin,
            bufferMin: selectedBarber.bufferMin,
            price: selectedBarber.resolvedPrice,
            amountDueOnline: chosenService.paymentMode === "FULL_PAYMENT"
              ? selectedBarber.resolvedPrice
              : chosenService.paymentMode === "DEPOSIT"
                ? Math.min(selectedBarber.resolvedPrice, chosenService.depositAmount)
                : 0,
            remainingDue: chosenService.paymentMode === "FULL_PAYMENT"
              ? 0
              : chosenService.paymentMode === "DEPOSIT"
                ? selectedBarber.resolvedPrice - Math.min(selectedBarber.resolvedPrice, chosenService.depositAmount)
                : selectedBarber.resolvedPrice,
          },
        ];
        const refreshedHold = await fetch("/api/booking/hold", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            items: items.map(({ attendeeId: id, barberId, serviceId, date: itemDate, startMin }) => ({
              attendeeId: id,
              barberId,
              serviceId,
              date: itemDate,
              startMin,
            })),
          }),
        });
        const holdJson: unknown = await refreshedHold.json();
        const held = holdSchema.safeParse(holdJson);
        if (!refreshedHold.ok || !held.success)
          throw new Error(z.object({ error: z.string().optional() }).safeParse(holdJson).data?.error ?? "یکی از زمان‌های گروه دیگر آزاد نیست.");

        const response = await fetch("/api/appointments/group", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            items: items.map(({ attendeeId: id, attendeeName: name, barberId, serviceId, date: itemDate, startMin }) => ({
              attendeeId: id,
              attendeeName: name,
              barberId,
              serviceId,
              date: itemDate,
              startMin,
            })),
          }),
        });
        const json: unknown = await response.json();
        if (!response.ok) throw new Error(z.object({ error: z.string().optional() }).safeParse(json).data?.error ?? "ثبت نوبت‌های گروهی انجام نشد.");
        const result = groupReceiptSchema.parse(json);
        if (result.paymentReference) {
          toast.push("نوبت‌های گروهی در انتظار پرداخت هستند.", "info");
          router.push(`/pay?ref=${encodeURIComponent(result.paymentReference)}`);
          return;
        }
        setReceipt({
          id: result.appointmentIds[0],
          reference: null,
          amountDueOnline: result.amountDueOnline,
          remainingDue: result.remainingDue,
          appointments: items.map((item, index) => ({
            id: result.appointmentIds[index],
            attendeeName: item.attendeeName,
            serviceName: item.serviceName,
            barberName: item.barberName,
            date: item.date,
            startMin: item.startMin,
            durationMin: item.durationMin,
            remainingDue: item.remainingDue,
          })),
        });
        setStep(4);
        toast.push("نوبت‌های گروهی ثبت و تأیید شدند.", "success");
        router.refresh();
        return;
      }
      const response = await fetch("/api/appointments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ barberId: selectedBarber.id, serviceId: chosenService.id, date, startMin: time, clientName: identity.name, clientPhone: identity.phone, source: "ONLINE" }) });
      const json: unknown = await response.json();
      if (!response.ok) throw new Error(z.object({ error: z.string().optional() }).safeParse(json).data?.error ?? "این زمان لحظاتی پیش رزرو شد؛ زمان دیگری انتخاب کنید.");
      const result = receiptSchema.parse(json);
      if (result.paymentReference) {
        toast.push("نوبت در انتظار پرداخت است. برای قطعی‌شدن، پرداخت را تأیید کنید.", "info");
        router.push(`/pay?ref=${encodeURIComponent(result.paymentReference)}`);
        return;
      }
      setReceipt({
        id: result.appointmentId,
        reference: null,
        amountDueOnline: result.amountDueOnline,
        remainingDue: result.remainingDue,
        appointments: [{
          id: result.appointmentId,
          attendeeName: identity.name,
          serviceName: chosenService.name,
          barberName: selectedBarber.name,
          date,
          startMin: time,
          durationMin: selectedBarber.durationMin,
          remainingDue: result.remainingDue,
        }],
      });
      setStep(4);
      toast.push("نوبت شما ثبت و تأیید شد.", "success");
      router.refresh();
    } catch (error) {
      setHold(null);
      setSelectedBarberId(null);
      setStep(2);
      setRefreshKey((current) => current + 1);
      toast.push(error instanceof Error ? error.message : "ثبت نوبت انجام نشد؛ دوباره تلاش کنید.", "error");
    } finally { setBusy(false); }
  }

  function addCurrentBookingToGroup() {
    if (!chosenService || !selectedBarber || time === null || !attendeeName.trim()) return;
    const price = selectedBarber.resolvedPrice;
    const amountDueOnline = chosenService.paymentMode === "FULL_PAYMENT"
      ? price
      : chosenService.paymentMode === "DEPOSIT"
        ? Math.min(price, chosenService.depositAmount)
        : 0;
    setGroupItems((current) => [...current, {
      attendeeId,
      attendeeName,
      serviceId: chosenService.id,
      serviceName: chosenService.name,
      barberId: selectedBarber.id,
      barberName: selectedBarber.name,
      date,
      startMin: time,
      durationMin: selectedBarber.durationMin,
      barberDurationMin: selectedBarber.barberDurationMin,
      bufferMin: selectedBarber.bufferMin,
      price,
      amountDueOnline,
      remainingDue: price - amountDueOnline,
    }]);
    setHold(null);
    if (nextServiceId) {
      setServiceId(nextServiceId);
      setTime(null);
      setSelectedBarberId(null);
      setBarberFilter(null);
      setStep(1);
      return;
    }
    setSelectedServiceIds([]);
    setServiceId(null);
    setDate(todayISO());
    setTime(null);
    setSelectedBarberId(null);
    setBarberFilter(null);
    setStep(0);
  }

  function beginSelectedServices() {
    const firstServiceId = selectedServiceIds.find((id) =>
      !groupItems.some((item) => item.attendeeId === attendeeId && item.serviceId === id),
    );
    if (!firstServiceId) return;
    setServiceId(firstServiceId);
    setBarberFilter(null);
    setSelectedBarberId(null);
    setTime(null);
    setStep(1);
  }

  function toggleServiceSelection(id: number) {
    setSelectedServiceIds((current) => {
      if (current.includes(id)) return current.filter((serviceId) => serviceId !== id);
      const remainingSelected = current.filter((serviceId) =>
        !groupItems.some((item) => item.attendeeId === attendeeId && item.serviceId === serviceId),
      ).length;
      if (groupItems.length + remainingSelected >= 12) {
        toast.push("در هر برنامه حداکثر ۱۲ خدمت قابل ثبت است.", "error");
        return current;
      }
      return [...current, id];
    });
  }

  if (step === 4 && receipt) return <div className="mx-auto max-w-xl px-4 py-8 text-[#1f2e27]">
    <div className="ui-panel text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e2efe8] text-3xl font-black text-[#2f4a3a]">✓</div><h1 className="mt-5 text-2xl font-black">{receipt.appointments.length > 1 ? "نوبت‌های گروهی ثبت شدند" : "نوبت شما تأیید شد"}</h1><p className="mt-2 text-sm text-[#5f7168]">کد رهگیری <span className="font-bold text-[#2f4a3a]">#{receipt.id}</span> را نگه دارید.</p>
      <ol className="mt-6 space-y-3 text-right">{receipt.appointments.map((item) => <li key={item.id} className="rounded-2xl bg-[#f6f5f1] p-4 text-sm"><p className="font-bold">{item.attendeeName} · {item.serviceName} · {item.barberName}</p><p className="mt-1 text-[#5f7168]">{formatPersianDate(item.date)}، {minutesToLabel(item.startMin)} · کد #{item.id}</p><p className="mt-1 text-[#5f7168]">پرداخت در سالن: {formatPrice(item.remainingDue)}</p></li>)}</ol>
      <Link href="/account" className="ui-button mt-6 w-full">مشاهده نوبت من</Link>
      {receipt.appointments.map((item) => <button key={item.id} type="button" onClick={() => downloadIcs(`booking-${item.id}.ics`, buildAppointmentIcs({ title: `${item.serviceName}، فرشید معروف پور`, description: `کد رهگیری ${item.id} · ${item.barberName}`, location: "تهران، خیابان ولیعصر، پلاک ۱۲", date: item.date, startMin: item.startMin, durationMin: item.durationMin, referenceId: item.id }))} className="ui-button ui-button-quiet mt-3 w-full">افزودن {item.serviceName} به تقویم</button>)}
      <Link href="/home" className="mt-5 inline-block text-sm text-[#5f7168] hover:underline">بازگشت به خانه</Link>
    </div></div>;

  return <div className="mx-auto max-w-[720px] px-4 pb-36 pt-5 text-[#1f2e27] sm:px-6 sm:pb-28 sm:pt-9">
    <BookingAuthModal isOpen={authOpen && !user} onClose={() => setAuthOpen(false)} onAuthenticated={(signedIn) => void handleAuthenticated(signedIn)} demoPhoneHint={demoPhoneHint} />
    <BookingPolicySheet isOpen={policyOpen} onClose={() => setPolicyOpen(false)} onAccept={async () => { setPolicyAccepted(true); setPolicyOpen(false); await waitForHold(); }} version={policyVersion} items={policyItems} />
    <header className="mb-6 flex items-center justify-between gap-3"><button type="button" onClick={() => { if (step === 0) router.push("/home"); else setStep((step - 1) as Step); }} className="focus-ring flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-[#8a6a1e]"><Icon name="arrow" className="h-4 w-4" />بازگشت</button><div aria-label={`مرحله ${step + 1} از ۴`} className="flex items-center gap-2">{stageLabels.map((label, index) => <span key={label} title={label} className={`h-1.5 rounded-full transition-[width,background-color] duration-150 ${index === step ? "w-8 bg-[#0f5a3b]" : index < step ? "w-4 bg-[#7fc9a6]" : "w-4 bg-[#d6dad7]"}`} />)}</div><Link href="/home" aria-label="بستن رزرو" className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg"><Icon name="close" className="h-5 w-5" /></Link></header>
    {step > 0 && chosenService && <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-[#e2e5df] bg-white p-3 text-sm"><div className="flex min-w-0 items-center gap-2"><Icon name="scissors" className="h-5 w-5 text-[#2f4a3a]" /><strong className="truncate">{chosenService.name}</strong><span className="shrink-0 text-xs text-[#5f7168]">{chosenService.durationMin} دقیقه</span>{selectedServiceIds.length > 1 && <span className="shrink-0 text-xs text-[#5f7168]">{(groupItems.filter((item) => item.attendeeId === attendeeId && selectedServiceIds.includes(item.serviceId)).length + 1).toLocaleString("fa-IR")} از {selectedServiceIds.length.toLocaleString("fa-IR")}</span>}</div><button type="button" onClick={() => setStep(0)} className="focus-ring min-h-11 shrink-0 text-xs font-bold text-[#2f4a3a]">تغییر</button></div>}

    {step === 0 && <section aria-labelledby="service-title"><div className="ui-pagehead"><h1 id="service-title">چه خدمتی می‌خواهید؟</h1><p>خدمت موردنظر خود را انتخاب کنید.</p></div>
      <label className="ui-label" htmlFor="service-search">جست‌وجوی خدمت</label><div className="relative"><Icon name="search" className="pointer-events-none absolute right-4 top-3.5 h-5 w-5 text-[#5f7168]" /><input id="service-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="مثلاً فید یا طراحی ریش" className="ui-input pr-11" /></div>
      {categories.length > 2 && <div role="group" aria-label="دسته‌بندی خدمات" className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">{categories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`focus-ring ui-pill min-h-11 shrink-0 !px-4 ${category === item ? "bg-[#1f2e27] text-white" : "border border-[#e2e5df] bg-white text-[#8a6a1e]"}`}>{item}</button>)}</div>}
      <p className="mt-2 text-sm leading-6 text-[#5f7168]">می‌توانید چند خدمت را انتخاب کنید؛ برای هرکدام زمان و آرایشگر جداگانه تعیین می‌شود.</p>
      {groupItems.length > 0 && <p className="mt-3 rounded-xl bg-[#e2efe8] p-3 text-sm">تا اینجا {groupItems.length.toLocaleString("fa-IR")} خدمت به برنامه اضافه شده است.</p>}
      <div className="mt-5 space-y-2.5">{filteredServices.length ? filteredServices.map((item) => {
        const selected = selectedServiceIds.includes(item.id);
        return <button key={item.id} type="button" aria-pressed={selected} onClick={() => toggleServiceSelection(item.id)} className={`focus-ring bento-card-interactive flex min-h-[88px] w-full items-center gap-3 rounded-[20px] border bg-white p-3 text-right sm:p-4 ${selected ? "border-[#0f5a3b] bg-[#f0faf9]" : "border-[#e2e5df]"}`}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e2efe8] text-[#2f4a3a]"><Icon name="scissors" className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-[15px]">{item.name}</strong><span className="mt-0.5 block truncate text-xs text-[#5f7168]">{item.description}</span><span className="mt-1 block text-xs font-semibold text-[#8a6a1e]">{item.durationMin} دقیقه · {formatPrice(item.basePrice)}</span></span><span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-[#0f5a3b] bg-[#0f5a3b] text-white" : "border-[#c5cdca]"}`}>{selected ? "✓" : ""}</span></button>;
      }) : <p className="ui-panel text-sm text-[#5f7168]">خدمتی مطابق جست‌وجو یافت نشد؛ عبارت دیگری وارد کنید.</p>}</div>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[#e2e5df] bg-white/95 p-3 backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0"><button type="button" onClick={beginSelectedServices} disabled={selectedServiceIds.length === 0 || busy} className="ui-button mx-auto w-full max-w-[720px] disabled:cursor-not-allowed disabled:opacity-50">{selectedServiceIds.length ? `ادامه با ${selectedServiceIds.length.toLocaleString("fa-IR")} خدمت` : "یک یا چند خدمت انتخاب کنید"}</button></div>
    </section>}

    {step === 1 && <section aria-labelledby="time-title"><div className="ui-pagehead"><h1 id="time-title">چه زمانی مناسب است؟</h1><p>روز و ساعت آزاد را انتخاب کنید.</p></div>
      <div role="group" aria-label="تاریخ نوبت" className="hide-scrollbar flex gap-2 overflow-x-auto pb-2">{dates.map((day) => <button key={day} type="button" aria-pressed={date === day} onClick={() => { setDate(day); setTime(null); setSelectedBarberId(null); }} className={`focus-ring flex min-h-[70px] min-w-[77px] shrink-0 flex-col items-center justify-center rounded-2xl border px-2 text-sm ${date === day ? "border-[#0f5a3b] bg-[#0f5a3b] text-white" : "border-[#e2e5df] bg-white"}`}><span className="text-xs">{day === todayISO() ? "امروز" : persianDay(day)}</span><strong className="mt-0.5 text-[13px]">{persianDayNumber(day)}</strong></button>)}</div>
      {barberFilter && <div className="mt-3 flex items-center justify-between rounded-xl bg-[#e2efe8] p-3 text-sm"><span>زمان‌های {barbersList.find((b) => b.id === barberFilter)?.name ?? "آرایشگر"}</span><button type="button" onClick={() => { setBarberFilter(null); setSelectedBarberId(null); }} className="focus-ring min-h-11 text-xs font-bold text-[#2f4a3a]">نمایش همه</button></div>}
      <h2 className="mb-3 mt-6 text-lg font-black">ساعت‌های آزاد</h2>
      {availabilityLoading ? <div role="status" aria-label="در حال بررسی زمان‌ها" className="space-y-3">{[1,2,3].map((index) => <div key={index} className="skeleton h-16 rounded-2xl" />)}</div> : availabilityError ? <div role="alert" className="ui-panel text-sm text-[#9f3b4c]"><p>{availabilityError}</p><button className="ui-button ui-button-quiet mt-3" type="button" onClick={() => setRefreshKey((x) => x + 1)}>تلاش دوباره</button></div> : !availableTimes.length ? <div className="ui-panel text-sm leading-7 text-[#5f7168]"><p>این روز ظرفیت ندارد؛ روز دیگری را انتخاب کنید.</p>{dates.includes(addDaysISO(date,1)) && <button type="button" onClick={() => { setDate(addDaysISO(date, 1)); setTime(null); }} className="ui-button mt-3">بررسی روز بعد</button>}</div> : <div className="space-y-4">{groups.map((group) => { const times = availableTimes.filter((value) => value >= group.start && value < group.end); return times.length ? <div key={group.label} className="ui-card p-4"><h3 className="mb-3 text-sm font-bold text-[#8a6a1e]">{group.label}</h3><div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{times.map((value) => <button key={value} type="button" aria-label={`ساعت ${minutesToLabel(value)} آزاد`} aria-pressed={time === value} onClick={() => { setTime(value); setSelectedBarberId(null); setStep(2); }} className={`focus-ring min-h-12 rounded-xl border text-sm font-bold tabular-nums ${time === value ? "border-[#0f5a3b] bg-[#0f5a3b] text-white" : "border-[#d5d9d7] bg-[#f6f5f1] hover:border-[#0f5a3b]"}`}>{minutesToLabel(value)}</button>)}</div></div> : null; })}</div>}
    </section>}

    {step === 2 && <section aria-labelledby="barber-title"><div className="ui-pagehead"><h1 id="barber-title">کدام آرایشگر؟</h1><p>{formatPersianDate(date)} · {time === null ? "ابتدا یک ساعت انتخاب کنید" : `ساعت ${minutesToLabel(time)}`}</p></div>
      <label htmlFor="barber-filter" className="ui-label">فیلتر آرایشگر</label><select id="barber-filter" value={barberFilter ?? ""} onChange={(event) => { const id = Number(event.target.value); setBarberFilter(id || null); setSelectedBarberId(null); }} className="ui-input"><option value="">همه آرایشگران واجد شرایط</option>{availableBarbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}{barberFilter && !availableBarbers.some((b) => b.id === barberFilter) && <option value={barberFilter}>{barbersList.find((b) => b.id === barberFilter)?.name ?? "آرایشگر انتخابی"}</option>}</select>
      {availabilityLoading ? <div role="status" aria-label="در حال بررسی آرایشگران" className="mt-5 space-y-3">{[1,2].map((index) => <div key={index} className="skeleton h-24 rounded-2xl" />)}</div> : availabilityError ? <div role="alert" className="ui-panel mt-5 text-sm text-[#9f3b4c]"><p>{availabilityError}</p><button type="button" className="ui-button ui-button-quiet mt-3" onClick={() => setRefreshKey((x) => x + 1)}>تلاش دوباره</button></div> : <div className="mt-5 space-y-3">
        {available && !availableBarbers.some((b) => b.isExactAvailable) && <div className="rounded-[20px] border border-[#eedfa3] bg-[#f7f0d8] p-4 text-sm"><strong>این ساعت تکمیل شده است.</strong><p className="mt-1 leading-7">نزدیک‌ترین زمان‌های آزاد:</p><div className="mt-2 flex flex-wrap gap-2">{available.recoverySlots.filter((slot) => availableBarbers.some((barber) => barber.allAvailableSlots.some((candidate) => candidate.startMin === slot.startMin))).map((option) => <button key={option.startMin} type="button" onClick={() => { setTime(option.startMin); setSelectedBarberId(null); }} className="focus-ring min-h-11 rounded-xl bg-white px-3 font-semibold">{minutesToLabel(option.startMin)} · {option.barberCount.toLocaleString("fa-IR")} آرایشگر</button>)}</div></div>}
        {availableBarbers.length ? availableBarbers.map((barber) => <article key={barber.id} className={`ui-card p-4 ${selectedBarberId === barber.id && barber.isExactAvailable ? "!border-[#0f5a3b]" : ""}`}><div className="flex items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e2efe8] text-lg font-black text-[#2f4a3a]" aria-hidden="true">{barber.name.charAt(0)}</span><div className="min-w-0 flex-1"><h3 className="text-base font-bold">{barber.name}</h3><p className="truncate text-xs text-[#5f7168]">{barber.specialization || barber.title}</p>{barber.rating !== null && <p className="mt-1 text-xs font-semibold text-[#8a6a1e]">★ {barber.rating.toFixed(1)} · {barber.reviewCount.toLocaleString("fa-IR")} نظر تأییدشده</p>}</div>{barber.isExactAvailable ? <button type="button" onClick={() => setSelectedBarberId(barber.id)} aria-pressed={selectedBarberId === barber.id} className={`focus-ring min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold ${selectedBarberId === barber.id ? "bg-[#0f5a3b] text-white" : "bg-[#e2efe8] text-[#2f4a3a]"}`}>{selectedBarberId === barber.id ? "✓ انتخاب شد" : "انتخاب"}</button> : <span className="text-xs text-[#5f7168]">این ساعت پر است</span>}</div>{!barber.isExactAvailable && barber.nearbySlots.length > 0 && <div className="mt-3 border-t border-[#e2e5df] pt-3 text-xs"><p className="mb-2 text-[#5f7168]">نزدیک‌ترین زمان با {barber.name}:</p><div className="flex flex-wrap gap-2">{barber.nearbySlots.map((option) => <button key={option.startMin} type="button" onClick={() => { setTime(option.startMin); setSelectedBarberId(null); }} className="focus-ring min-h-11 rounded-xl border border-[#c8e4e5] px-3 font-bold text-[#2f4a3a]">{minutesToLabel(option.startMin)}</button>)}</div></div>}</article>) : <div role="status" className="ui-panel text-sm leading-7 text-[#5f7168]">برای این خدمت آرایشگر واجد شرایطی در این روز پیدا نشد. روز یا خدمت دیگری را انتخاب کنید.</div>}
      </div>}
      {!user && <p className="mt-5 rounded-2xl bg-[#e2efe8] p-4 text-sm leading-7 text-[#2f4a3a]">بعد از انتخاب آرایشگر، با شماره موبایل وارد شوید یا حساب بسازید؛ سپس زمان برایتان نگه داشته می‌شود و می‌توانید رزرو را بررسی کنید.</p>}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[#e2e5df] bg-white/95 p-3 backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0"><button type="button" onClick={() => void continueFromBarber()} disabled={!canPickBarber || busy || availabilityLoading} className="ui-button mx-auto w-full max-w-[720px]">{busy ? "در حال بررسی…" : user ? "بازبینی رزرو" : "ورود / ساخت حساب و ادامه"}</button></div>
    </section>}

    {step === 3 && chosenService && selectedBarber && time !== null && <section aria-labelledby="checkout-title"><div className="ui-pagehead"><h1 id="checkout-title">خلاصه رزرو</h1><p>اطلاعات نوبت و مبلغ را پیش از ثبت نهایی بررسی کنید.</p></div>
      {user && <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#e2e5df] bg-white p-3 text-sm"><p>رزرو برای <strong>{user.name}</strong> <span dir="ltr" className="font-semibold text-[#5f7168]">{user.phone}</span></p><button type="button" onClick={() => setStep(2)} className="focus-ring min-h-11 shrink-0 text-xs font-bold text-[#2f4a3a]">تغییر</button></div>}
      {hold && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#b7dfe1] bg-[#e2efe8] p-4 text-sm font-semibold text-[#2f4a3a]"><span>{hold.left > 0 ? "این زمان موقتاً برای شما نگه داشته شده است." : "مهلت این زمان به پایان رسید."}</span><span dir="ltr" className="font-mono text-lg tabular-nums">{String(Math.floor(hold.left / 60)).padStart(2,"0")}:{String(hold.left % 60).padStart(2,"0")}</span></div>}
      <div className="ui-panel mb-4 space-y-4">
        <div>
          <label htmlFor="booking-attendee" className="ui-label">این نوبت برای چه کسی است؟</label>
          <select id="booking-attendee" value={attendeeId} onChange={(event) => setAttendeeId(event.target.value)} className="ui-input">
            {user && <option value="primary">{user.name} (شماره تماس اصلی)</option>}
            {companions.map((companion) => <option key={companion.id} value={companion.id}>{companion.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="booking-companion-name" className="sr-only">نام همراه</label>
          <input id="booking-companion-name" value={newCompanionName} onChange={(event) => setNewCompanionName(event.target.value)} minLength={2} maxLength={60} placeholder="نام همراه برای رزرو گروهی" className="ui-input" />
          <button type="button" disabled={newCompanionName.trim().length < 2} onClick={() => {
            const id = crypto.randomUUID();
            const name = newCompanionName.trim();
            setCompanions((current) => [...current, { id, name }]);
            setAttendeeId(id);
            setNewCompanionName("");
          }} className="focus-ring ui-button ui-button-quiet min-h-12 shrink-0 disabled:cursor-not-allowed disabled:opacity-50">افزودن همراه</button>
        </div>
        <p className="text-xs leading-6 text-[#5f7168]">برای هر نفر چند خدمت اضافه کنید. زمان پردازش یک خدمت می‌تواند با کار آرایشگر دیگری هم‌زمان باشد؛ یک آرایشگر نمی‌تواند هم‌زمان دو خدمت انجام دهد.</p>
      </div>
      {groupItems.length > 0 && <section aria-labelledby="group-bookings-title" className="mb-4 rounded-2xl border border-[#c8e4e5] bg-[#f5fbf8] p-4">
        <h2 id="group-bookings-title" className="font-bold">نوبت‌های افزوده‌شده ({groupItems.length})</h2>
        <ol className="mt-3 space-y-2">
          {groupItems.map((item, index) => <li key={`${item.attendeeId}-${item.serviceId}-${item.date}-${item.startMin}-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-white p-3 text-sm">
            <div className="min-w-0"><p className="font-bold">{item.attendeeName} · {item.serviceName}</p><p className="mt-1 text-xs text-[#5f7168]">{item.barberName} · {formatPersianDate(item.date)}، {minutesToLabel(item.startMin)} تا {minutesToLabel(item.startMin + item.durationMin)}</p><p className="mt-1 text-xs text-[#5f7168]">مدت کل {item.durationMin.toLocaleString("fa-IR")} دقیقه · کار آرایشگر {item.barberDurationMin.toLocaleString("fa-IR")} دقیقه{item.durationMin > item.barberDurationMin ? ` · پردازش ${ (item.durationMin - item.barberDurationMin).toLocaleString("fa-IR")} دقیقه` : ""}</p></div>
            <button type="button" aria-label={`حذف نوبت ${item.serviceName} برای ${item.attendeeName}`} onClick={() => setGroupItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="focus-ring min-h-11 shrink-0 rounded-lg px-3 text-xs font-bold text-rose-700">حذف</button>
          </li>)}
        </ol>
      </section>}
      <dl className="ui-panel space-y-3 text-sm">{[["خدمت",chosenService.name],["آرایشگر",selectedBarber.name],["تاریخ",formatPersianDate(date)],["زمان",minutesToLabel(time)],["مدت کل خدمت",`${selectedBarber.durationMin.toLocaleString("fa-IR")} دقیقه`],["زمان اشغال آرایشگر",`${selectedBarber.barberDurationMin.toLocaleString("fa-IR")} دقیقه`],["مبلغ خدمت",formatPrice(selectedBarber.resolvedPrice)],[chosenService.paymentMode === "FULL_PAYMENT" ? "پرداخت کامل آنلاین" : "بیعانه آنلاین",formatPrice(chosenService.paymentMode === "FULL_PAYMENT" ? selectedBarber.resolvedPrice : chosenService.paymentMode === "DEPOSIT" ? Math.min(selectedBarber.resolvedPrice, chosenService.depositAmount) : 0)],["مانده در سالن", formatPrice(chosenService.paymentMode === "FULL_PAYMENT" ? 0 : chosenService.paymentMode === "DEPOSIT" ? selectedBarber.resolvedPrice - Math.min(selectedBarber.resolvedPrice, chosenService.depositAmount) : selectedBarber.resolvedPrice)]].map(([label,value]) => <div key={label} className="flex items-center justify-between gap-4 border-b border-[#e2e5df] pb-2 last:border-0 last:pb-0"><dt className="text-[#5f7168]">{label}</dt><dd className="text-left font-bold tabular-nums">{value}</dd></div>)}</dl>
      <p className="mt-4 text-xs leading-7 text-[#5f7168]">مبلغ نهایی در سرور دوباره بررسی می‌شود. نوبت دارای پیش‌پرداخت پس از تأیید پرداخت قطعی خواهد شد.</p>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-[#e2e5df] bg-white/95 p-3 backdrop-blur sm:static sm:mt-6 sm:flex-row-reverse sm:items-center sm:border-0 sm:bg-transparent sm:p-0">
        {nextServiceId && <button type="button" onClick={addCurrentBookingToGroup} disabled={groupItems.length >= 11 || busy || !attendeeName.trim()} className="focus-ring ui-button ui-button-quiet mx-auto w-full max-w-[720px] disabled:cursor-not-allowed disabled:opacity-50 sm:mx-0 sm:w-auto">
          {groupItems.length >= 11 ? "حداکثر ۱۲ خدمت در یک رزرو" : "افزودن این خدمت و انتخاب خدمت بعدی"}
        </button>}
        <button type="button" onClick={() => hold?.left ? void submit() : (setStep(2), setRefreshKey((x) => x + 1))} disabled={busy} className="ui-button mx-auto w-full max-w-[720px] sm:mx-0">{busy ? "در حال ثبت…" : hold?.left ? groupItems.length ? "ثبت همهٔ خدمات" : chosenService.paymentMode === "NO_PAYMENT" ? "تأیید و ثبت نوبت" : "ثبت و ادامه به پرداخت" : "بررسی زمان‌های جدید"}</button>
      </div>
    </section>}
  </div>;
}
