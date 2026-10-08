import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HomeHero } from "@/components/home/HomeHero";
import { DashboardShell, Panel } from "@/components/dashboard-shell";
import { getCurrentUser } from "@/lib/session";
import { getHomeContentSnapshot } from "@/lib/home-content";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "پیش‌نمایش خصوصی محتوای سایت",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function SiteContentPreviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("settings:manage")) notFound();
  const snapshot = await getHomeContentSnapshot();
  const content = snapshot.draft;

  return (
    <DashboardShell title="پیش‌نمایش خصوصی" subtitle={user.name} sections={[{ id: "preview-hero", label: "هدر" }, { id: "preview-copy", label: "متن بخش‌ها" }]}>
      <header className="ops-panel !bg-[#f7f7f2]">
        <p className="text-xs font-bold text-[#0f5a3b]">خصوصی · فقط مدیران محتوا</p>
        <h1 className="mt-2 text-2xl font-black">پیش‌نمایش پیش‌نویس صفحهٔ اصلی</h1>
        <p className="mt-2 text-sm leading-7 text-bone/65">این مسیر عمومی نیست. بازدیدکنندگان و صفحه‌های عمومی فقط نسخهٔ منتشرشده را دریافت می‌کنند.</p>
        <Link href="/admin/site-content" className="ops-btn mt-4 min-h-11">بازگشت به ویرایش محتوا</Link>
      </header>

      <section id="preview-hero" aria-label="پیش‌نمایش هدر" className="overflow-hidden rounded-3xl border border-[var(--color-border)]">
        <HomeHero settings={content.hero} />
      </section>

      <Panel id="preview-copy" title="پیش‌نمایش متن و تیترها" description="چیدمان خلاصه برای بررسی متن فارسی؛ انتشار عمومی تنها از صفحهٔ مدیریت محتوا انجام می‌شود.">
        <div className="grid gap-4 md:grid-cols-2">
          {([
            ["دربارهٔ ما", content.about],
            ["معرفی تیم", content.team],
            ["نمونه‌کارها", content.portfolio],
            ["آکادمی", content.academy],
            ["راهنمایی رزرو", content.booking],
          ] as const).map(([label, section]) => (
            <article key={label} className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
              <p className="text-xs font-bold text-brass-700">{label}</p>
              <h2 className="mt-2 text-xl font-black leading-8">{section.heading}</h2>
              <p className="mt-2 text-sm leading-7 text-bone-500">{section.body}</p>
            </article>
          ))}
        </div>
      </Panel>
    </DashboardShell>
  );
}
