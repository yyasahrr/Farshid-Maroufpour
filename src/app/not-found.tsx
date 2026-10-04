import Link from "next/link";
import { BrandMonogram, Icon } from "@/components/icons";
import { SITE_NAME } from "@/lib/site";

export const metadata = { title: "صفحه پیدا نشد" };

/**
 * Branded 404. Rendered for unknown routes and for `notFound()` calls in service
 * and barber detail pages, so a stale link still offers a way forward.
 */
export default function NotFound() {
  return (
    <main dir="rtl" className="flex min-h-[100svh] flex-col items-center justify-center gap-6 bg-bone-700 px-5 py-16 text-center text-white">
      <Link href="/home" className="focus-ring flex items-center gap-3 rounded-xl text-sm font-black">
        <BrandMonogram className="!h-10 !w-[30px]" />
        <span>{SITE_NAME}</span>
      </Link>
      <p dir="ltr" className="text-6xl font-black tracking-tight text-[#a37b45]">
        ۴۰۴
      </p>
      <div>
        <h1 className="text-2xl font-black">این صفحه پیدا نشد</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-8 text-bone-300">
          ممکن است آدرس تغییر کرده باشد یا آرایشگر و خدمتی که دنبالش بودید دیگر فعال نباشد.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/home" className="ui-button">
          <Icon name="home" className="h-4 w-4" />
          بازگشت به خانه
        </Link>
        <Link href="/booking" className="ui-button ui-button-quiet !bg-white/10 !text-white">
          رزرو نوبت
        </Link>
      </div>
      <p className="text-xs text-[#b8c5c6]">
        برای پیگیری نوبت‌های ثبت‌شده به{" "}
        <Link href="/track" className="ui-link !text-bone-300">
          صفحه پیگیری
        </Link>{" "}
        سر بزنید.
      </p>
    </main>
  );
}
