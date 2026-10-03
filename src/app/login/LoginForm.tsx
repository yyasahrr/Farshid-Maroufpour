"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BrandMonogram } from "@/components/icons";
import { loginAction } from "@/lib/actions/auth";

export function LoginForm({ demoCredentials }: { demoCredentials: { label: string; value: string }[] }) {
  const [error, formAction, pending] = useActionState(loginAction, null);

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="glass-card w-full max-w-md rounded-3xl p-8 border-2 border-[#c59b4b]/35 shadow-lg">
        <Link
          href="/home"
          className="focus-ring rounded text-xs font-semibold text-[#0f5a3b] hover:text-[#c59b4b]"
        >
          ← بازگشت به وبسایت
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <BrandMonogram className="!h-11 !w-[33px] text-[#0f5a3b]" />
          <span className="flex items-baseline gap-2">
            <span className="text-xl font-black tracking-[0.3em] text-[#0f5a3b]">
              FARSHID
            </span>
            <span className="text-[10px] font-bold tracking-widest text-[#c59b4b]">
              PORTAL
            </span>
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-black text-bone">
          ورود به پنل کارکنان
        </h1>
        <p className="mt-1 text-xs text-bone/60">
          دسترسی یکپارچه مدیر سالن، پذیرش و آرایشگران آتلیه
        </p>

        {demoCredentials.length > 0 && (
          <div className="mt-4 rounded-2xl border border-[#c59b4b]/30 bg-white/70 p-3.5 text-xs text-bone/70 space-y-1">
            <p className="font-bold text-[#0f5a3b]">حساب‌های آزمایشی (فقط در حالت پیش‌نمایش):</p>
            {demoCredentials.map((item) => (
              <p key={item.value}>
                {item.label}:{" "}
                <span className="font-mono" dir="ltr">
                  {item.value}
                </span>
              </p>
            ))}
          </div>
        )}

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="phone"
              className="text-xs font-semibold text-bone/70"
            >
              شماره موبایل پرسنلی
            </label>
            <input
              id="phone"
              name="phone"
              dir="ltr"
              required
              autoComplete="username"
              inputMode="numeric"
              placeholder="09120000001"
              className="focus-ring mt-1.5 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-4 py-3 text-sm font-mono"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="text-xs font-semibold text-bone/70"
            >
              رمز عبور
            </label>
            <input
              id="password"
              name="password"
              type="password"
              dir="ltr"
              required
              autoComplete="current-password"
              className="focus-ring mt-1.5 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-4 py-3 text-sm"
            />
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 font-medium"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="focus-ring w-full rounded-full bg-[#0f5a3b] py-3.5 text-sm font-black text-white shadow-md transition hover:bg-[#094028] disabled:bg-bone/15 disabled:text-bone/40"
          >
            {pending ? "در حال اعتبارسنجی…" : "ورود به پنل مدیریت"}
          </button>
        </form>
      </div>
    </main>
  );
}
