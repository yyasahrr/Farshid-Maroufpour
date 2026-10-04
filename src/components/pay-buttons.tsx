"use client";

import { useActionState } from "react";
import { processPaymentAction } from "@/lib/actions/payments";

export function PayButtons({ reference }: { reference: string }) {
  const [result, action, pending] = useActionState(processPaymentAction, null);
  return <form action={action} className="mt-4 space-y-3">
    <input type="hidden" name="reference" value={reference} />
    <p className="text-sm leading-7 text-bone-500">این محیط درگاه بانکی واقعی ندارد. دکمه‌ها فقط پاسخِ آزمایشی را در سرور شبیه‌سازی می‌کنند و جایگزین پرداخت واقعی نیستند.</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <button type="submit" name="outcome" value="OK" disabled={pending} className="ui-button w-full">{pending ? "در حال بررسی…" : "تأیید پرداخت آزمایشی"}</button>
      <button type="submit" name="outcome" value="FAILED" disabled={pending} className="ui-button ui-button-quiet w-full">شبیه‌سازی پرداخت ناموفق</button>
    </div>
    {result && <p role={result.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${result.ok ? "bg-[#e4ece3] text-brand-400" : "bg-rose-50 text-rose-700"}`}>{result.message}</p>}
  </form>;
}
