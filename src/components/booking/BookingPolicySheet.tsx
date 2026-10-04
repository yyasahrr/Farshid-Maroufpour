"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

export function BookingPolicySheet({
  isOpen,
  onClose,
  onAccept,
  version,
  items,
  localOnly,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void | Promise<void>;
  version: string;
  items: string[];
  /** Guest checkout: accept locally without a server-side record (no user id). */
  localOnly?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (isOpen && el && !el.open) el.showModal();
    return () => { if (el?.open) el.close(); };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleConfirm() {
    if (!agreed || loading) return;
    setLoading(true);
    setError(null);
    try {
      if (!localOnly) {
        const response = await fetch("/api/auth/policy/accept", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version }),
        });
        if (!response.ok) {
          const result: { error?: string } = await response.json().catch(() => ({}));
          throw new Error(result.error ?? "ثبت تأیید قوانین انجام نشد. دوباره تلاش کنید.");
        }
      }
      await onAccept();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت تأیید قوانین انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="policy-sheet-title"
      className="policy-dialog w-full max-w-lg rounded-t-3xl border border-bone-150 bg-white p-6 text-bone-700 shadow-xl sm:rounded-3xl sm:p-8"
    >
      <div className="flex items-center justify-between border-b border-bone-150 pb-3">
        <h2 id="policy-sheet-title" className="text-lg font-black">نکات مهم رزرو</h2>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="بستن قوانین" className="focus-ring flex h-11 w-11 items-center justify-center rounded-xl bg-bone-100"><Icon name="close" className="h-5 w-5" /></button>
      </div>
      <p className="mt-4 text-sm leading-7 text-brass-800">لطفاً پیش از ادامه، شرایط جاری سالن را مطالعه کنید.</p>
      <ol className="mt-3 space-y-2.5">
        {items.map((item, index) => (
          <li key={item} className="flex gap-3 rounded-2xl bg-bone-100 p-3 text-sm leading-7">
            <span className="font-bold text-brand-700">{(index + 1).toLocaleString("fa-IR")}.</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 border-t border-bone-150 pt-4">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="focus-ring h-5 w-5 accent-brand-700" />
          این موارد را مطالعه کردم و می‌پذیرم.
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        <button type="button" onClick={() => void handleConfirm()} disabled={!agreed || loading} className="focus-ring mt-4 min-h-12 w-full rounded-2xl bg-brand-700 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
          {loading ? "در حال ثبت…" : "تأیید و ادامه"}
        </button>
      </div>
    </dialog>
  );
}
