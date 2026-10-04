"use client";

import { useEffect, useState } from "react";

export function PaymentCountdown({ expiresAt, initialSeconds }: { expiresAt: number; initialSeconds: number }) {
  const [remaining, setRemaining] = useState(initialSeconds);
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return remaining > 0 ? <p className="mt-4 rounded-xl bg-[#e2efe8] p-3 text-center text-sm font-semibold text-brand-400" role="status">این زمان موقتاً نگه داشته شده است: <span dir="ltr" className="font-mono font-black tabular-nums">{String(Math.floor(remaining/60)).padStart(2,"0")}:{String(remaining%60).padStart(2,"0")}</span></p> : <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-center text-sm text-rose-700"><p>مهلت این زمان پایان یافت. زمان دیگری انتخاب کنید.</p><a href="/booking" className="ui-button mt-3">بررسی زمان‌های جدید</a></div>;
}
