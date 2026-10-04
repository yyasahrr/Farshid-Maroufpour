"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BookingAuthModal, type AuthUser } from "@/components/booking/BookingAuthModal";
import { Icon } from "@/components/icons";

/**
 * Enroll in an online course. While the visitor is logged in there is no
 * login/OTP step anywhere: one click books the seat (and jumps to /pay only
 * when the course is priced). Guests get the single modal that creates a
 * lightweight account first.
 */
export function CourseEnrollForm({
  courseId,
  courseSlug,
  price,
  unavailable,
  initialUser,
  demoPhoneHint,
}: {
  courseId: number;
  courseSlug: string;
  price: number;
  unavailable: boolean;
  initialUser: AuthUser | null;
  demoPhoneHint?: string;
}) {
  const [user, setUser] = useState(initialUser);
  const [authOpen, setAuthOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ enrollmentId: number; status: string; paymentReference: string | null } | null>(null);
  const router = useRouter();

  async function enroll(event: FormEvent) {
    event.preventDefault();
    if (busy || !user) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/courses/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data: { error?: string; code?: string; enrollmentId?: number; status?: string; paymentReference?: string | null } =
        await response.json();
      if (response.ok && data.enrollmentId) {
        setResult({ enrollmentId: data.enrollmentId, status: data.status ?? "ACTIVE", paymentReference: data.paymentReference ?? null });
        if (!data.paymentReference) router.refresh();
        return;
      }
      if (data.code === "ALREADY") {
        router.refresh();
        setError("شما از قبل در این دوره ثبت‌نام کرده‌اید.");
        return;
      }
      throw new Error(data.error ?? "ثبت‌نام انجام نشد.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت‌نام انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  if (unavailable)
    return (
      <div role="status" className="rounded-xl bg-brass-50 p-4 text-sm font-semibold text-brass-700">
        ثبت‌نام این دوره بسته یا ظرفیت آن تکمیل شده است. دوره‌های دیگر آکادمی را ببینید.
      </div>
    );

  if (result)
    return (
      <div role="status" className="rounded-2xl bg-brand-50 p-5 text-sm">
        <span className="ui-pill ui-tag-academy">
          <Icon name="check" className="h-4 w-4" />
          {result.paymentReference ? "صندلی رزرو شد" : "ثبت‌نام قطعی شد"}
        </span>
        <p className="mt-3 leading-7 text-brass-800">
          {result.paymentReference
            ? "برای باز شدن درس‌ها، شهریه را در صفحه پرداخت تأیید کنید."
            : "همین حالا می‌توانید اولین درس را شروع کنید."}
        </p>
        {result.paymentReference ? (
          <Link href={`/pay?ref=${encodeURIComponent(result.paymentReference)}`} className="ui-button mt-4 w-full">
            ادامه به پرداخت
          </Link>
        ) : (
          <Link href={`/courses/${courseSlug}/learn`} className="ui-button mt-4 w-full">
            ورود به دوره
          </Link>
        )}
      </div>
    );

  return (
    <>
      <BookingAuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={(value) => {
          setUser(value);
          setAuthOpen(false);
        }}
        demoPhoneHint={demoPhoneHint}
      />
      {!user ? (
        <div>
          <p className="text-sm leading-7 text-bone-500">
            برای ثبت‌نام در دوره‌های آنلاین با شماره موبایل وارد شوید؛ اگر حساب ندارید فقط نام‌تان پرسیده
            می‌شود و کد پیامکی یک‌باری همین‌جا ارسال می‌شود.
          </p>
          <button type="button" onClick={() => setAuthOpen(true)} className="ui-button mt-4 w-full">
            ورود و ثبت‌نام
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void enroll(event)}>
          <p className="text-sm leading-7 text-bone-500">
            ثبت‌نام به نام <b className="text-bone-700">{user.name}</b> انجام می‌شود
            {price > 0 ? " و پس از پرداخت شهریه قطعی می‌گردد." : "."}
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="ui-button mt-4 w-full">
            {busy ? "در حال ثبت…": price > 0 ? "ثبت‌نام و ادامه به پرداخت" : "ثبت‌نام رایگان در دوره"}
          </button>
        </form>
      )}
    </>
  );
}
