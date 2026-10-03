"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BrandMonogram, Icon } from "@/components/icons";
import { SITE_NAME } from "@/lib/site";

/**
 * Route-level error boundary. Replaces Next.js' default English screen and keeps
 * the visitor inside the brand shell with a retry affordance.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[route-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main dir="rtl" className="flex min-h-[100svh] flex-col items-center justify-center gap-6 bg-[#1f2e27] px-5 py-16 text-center text-white">
      <Link href="/home" className="focus-ring flex items-center gap-3 rounded-xl text-sm font-black">
        <BrandMonogram className="!h-10 !w-[30px]" />
        <span>{SITE_NAME}</span>
      </Link>
      <div>
        <h1 className="text-2xl font-black">مشکلی در نمایش این صفحه پیش آمد</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-8 text-[#d5dfe0]">
          اتصال یا داده‌ها لحظه‌ای در دسترس نبودند. یک‌بار دیگر تلاش کنید؛ اگر تکرار شد برای رزرو با پذیرش تماس
          بگیرید.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="ui-button">
          <Icon name="refresh" className="h-4 w-4" />
          تلاش دوباره
        </button>
        <Link href="/home" className="ui-button ui-button-quiet !bg-white/10 !text-white">
          بازگشت به خانه
        </Link>
      </div>
      {error.digest && (
        <p dir="ltr" className="text-[11px] text-[#b8c5c6]">
          ref: {error.digest}
        </p>
      )}
    </main>
  );
}
