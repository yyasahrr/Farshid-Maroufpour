"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { Badge, EmptyState } from "@/components/ui-cards";
import { formatPersianDate, minutesToLabel } from "@/lib/time";

type Tracked = { id: number; clientName: string; date: string; startMin: number; endMin: number; status: string; barberName: string; barberSlug: string; serviceId: number; serviceName: string };
const statusMap: Record<string, string> = { PENDING: "در انتظار پرداخت", CONFIRMED: "تأییدشده", CHECKED_IN: "حاضر در سالن", IN_PROGRESS: "در حال انجام", COMPLETED: "تکمیل‌شده", NO_SHOW: "عدم حضور", CANCELLED_BY_CLIENT: "لغوشده", CANCELLED_BY_STAFF: "لغوشده توسط سالن" };

export function TrackForm({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<Tracked[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lookup = useCallback(async (value: string) => {
    if (!value.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/appointments/track?q=${encodeURIComponent(value.trim())}`, { cache: "no-store" });
      const result: { items?: Tracked[]; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "پیگیری انجام نشد.");
      setItems(result.items ?? []);
    } catch (err) { setItems(null); setError(err instanceof Error ? err.message : "پیگیری انجام نشد؛ دوباره تلاش کنید."); }
    finally { setBusy(false); }
  }, []);
  // Initial lookup for deep-linked tracking codes (?q=...); runs once on mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot async lookup, not a render loop
  useEffect(() => { if (initialQuery) void lookup(initialQuery); }, [initialQuery, lookup]);
  function submit(event: FormEvent) { event.preventDefault(); void lookup(query); }
  return <div><form onSubmit={submit} className="ui-panel"><label className="ui-label" htmlFor="track-query">شماره موبایل خود یا کد رهگیری</label><div className="flex flex-col gap-2 sm:flex-row"><input id="track-query" dir="ltr" value={query} onChange={(event) => setQuery(event.target.value)} inputMode="numeric" required placeholder="کد نوبت یا ۰۹۱۲…" className="ui-input sm:flex-1" /><button type="submit" disabled={busy} className="ui-button sm:min-w-32"><Icon name="search" className="h-4 w-4" />{busy ? "در حال بررسی…" : "پیگیری"}</button></div>{error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}<p className="mt-3 text-xs leading-6 text-[#5f7168]">برای حفظ حریم خصوصی، فقط نوبت‌های متعلق به حساب واردشده نمایش داده می‌شود.</p></form>
    {items !== null && <div className="mt-6 space-y-3">{items.length ? items.map((item) => <article key={item.id} className="ui-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-[#5f7168]">کد {item.id.toLocaleString("fa-IR")}</p><h2 className="mt-1 text-lg font-black">{item.serviceName}</h2><p className="mt-1 text-sm text-[#5f7168]">{item.barberName}</p></div><Badge tone={item.status === "CONFIRMED" || item.status === "COMPLETED" ? "success" : item.status.startsWith("CANCELLED") ? "danger" : "warn"}>{statusMap[item.status] ?? item.status}</Badge></div><p className="mt-4 border-t border-[#e2e5df] pt-3 text-sm font-semibold">{formatPersianDate(item.date)} · {minutesToLabel(item.startMin)} تا {minutesToLabel(item.endMin)}</p><div className="mt-4 flex flex-wrap gap-4"><Link href="/account#bookings" className="ui-link">جزئیات در پنل من</Link><Link href={`/booking?service=${item.serviceId}&barber=${item.barberSlug}`} className="ui-link">رزرو دوباره</Link></div></article>) : <EmptyState title="نوبتی پیدا نشد" description="کد نوبت را بررسی کنید یا در پنل من، فهرست همه نوبت‌ها را ببینید." action={<Link className="ui-button" href="/account">نوبت‌های من</Link>} />}</div>}
  </div>;
}
