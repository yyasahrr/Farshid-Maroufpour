"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BookingAuthModal, type AuthUser } from "@/components/booking/BookingAuthModal";
import { Icon } from "@/components/icons";

export function ClassRegisterForm({ classId, unavailable, initialUser, demoPhoneHint }: { classId: number; unavailable: boolean; initialUser: AuthUser | null; demoPhoneHint?: string }) {
  const [user, setUser] = useState(initialUser);
  const [authOpen, setAuthOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ registrationId: number; paymentReference: string | null } | null>(null);

  async function register(event: FormEvent) {
    event.preventDefault();
    if (busy || !user?.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/classes/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ classId, studentName: user.name, studentPhone: user.phone }) });
      const data: { error?: string; registrationId?: number; paymentReference?: string | null } = await response.json();
      if (!response.ok || !data.registrationId) throw new Error(data.error ?? "ثبت‌نام انجام نشد. ظرفیت دوره را بررسی کنید.");
      setResult({ registrationId: data.registrationId, paymentReference: data.paymentReference ?? null });
    } catch (err) { setError(err instanceof Error ? err.message : "ثبت‌نام انجام نشد."); }
    finally { setBusy(false); }
  }

  if (unavailable) return <div role="status" className="rounded-xl bg-brass-50 p-4 text-sm font-semibold text-brass-700">ثبت‌نام این دوره بسته یا ظرفیت آن تکمیل شده است. دوره‌های باز را در آکادمی ببینید.</div>;
  if (result) return <div role="status" className="rounded-2xl bg-brand-50 p-5 text-sm"><span className="ui-pill ui-tag-academy"><Icon name="check" className="h-4 w-4" />درخواست ثبت شد</span><p className="mt-3 font-bold">کد ثبت‌نام: {result.registrationId.toLocaleString("fa-IR")}</p><p className="mt-1 leading-7 text-brass-800">{result.paymentReference ? "برای قطعی‌شدن صندلی، شهریه را در صفحه پرداخت بررسی و تأیید کنید." : "ثبت‌نام شما در دوره تأیید شد."}</p><Link href={result.paymentReference ? `/pay?ref=${encodeURIComponent(result.paymentReference)}` : "/account#classes"} className="ui-button mt-4 w-full">{result.paymentReference ? "ادامه به پرداخت" : "مشاهده دوره‌های من"}</Link></div>;

  return <>
    <BookingAuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onAuthenticated={(value) => { setUser(value); setAuthOpen(false); }} demoPhoneHint={demoPhoneHint} />
    {!user ? <div><p className="text-sm leading-7 text-bone-500">برای ثبت‌نام، ابتدا با شماره موبایل وارد شوید. اگر حساب ندارید فقط نام‌تان پرسیده می‌شود.</p><button type="button" onClick={() => setAuthOpen(true)} className="ui-button mt-4 w-full">ورود و ثبت‌نام</button></div> : <form onSubmit={(event) => void register(event)}><p className="text-sm leading-7 text-bone-500">این درخواست به نام <b className="text-bone-700">{user.name}</b> و شمارهٔ <span dir="ltr" className="inline-block font-semibold">{user.phone}</span> ثبت می‌شود.</p>{error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button type="submit" disabled={busy} className="ui-button mt-4 w-full">{busy ? "در حال ثبت…" : "ثبت‌نام در دوره"}</button></form>}
  </>;
}
