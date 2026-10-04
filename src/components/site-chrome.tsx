import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { services } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { SiteNavigation } from "@/components/site-navigation";
import { BrandMonogram, Icon } from "@/components/icons";
export { MobileNav } from "@/components/mobile-nav";

export async function SiteHeader() {
  const [user, serviceRows] = await Promise.all([
    getCurrentUser(),
    db.select({ id: services.id, name: services.name }).from(services).where(eq(services.active, true)),
  ]);
  const panelHref = user?.role === "BARBER" ? "/barber" : user && user.role !== "CLIENT" ? "/admin" : "/account";
  return <SiteNavigation services={serviceRows} panelHref={panelHref} userName={user?.name ?? null} />;
}

export function SiteFooter() {
  return <footer id="contact" className="bg-bone-700 text-white">
    <div className="ui-container grid gap-8 py-12 sm:grid-cols-3">
      <div><Link href="/home" className="inline-flex items-center gap-3 text-sm font-black"><BrandMonogram className="!h-10 !w-[30px]" /><span>آکادمی زیبایی فرشید معروف پور</span></Link><p className="mt-4 max-w-sm text-sm leading-8 text-bone-300">مراقبت از استایل، همراه آموزش حرفه‌ای. وقت مناسب را آنلاین پیدا کنید و برای دوره‌های آکادمی ثبت‌نام کنید.</p></div>
      <div><h2 className="mb-4 font-bold">دسترسی</h2><ul className="space-y-3 text-sm text-bone-300">{[{ href: "/booking", label: "رزرو نوبت" }, { href: "/barbers", label: "آرایشگران" }, { href: "/academy", label: "آکادمی" }, { href: "/shop", label: "فروشگاه" }, { href: "/account", label: "پنل من" }].map((item) => <li key={item.href}><Link href={item.href} className="hover:text-brand-200">{item.label}</Link></li>)}</ul></div>
      <div><h2 className="mb-4 font-bold">ارتباط با پذیرش</h2><ul className="space-y-3 text-sm text-bone-300"><li className="flex items-center gap-2"><Icon name="location" className="h-4 w-4" />تهران، خیابان ولیعصر، پلاک ۱۲</li><li><a href="tel:+982191000000" dir="ltr" className="inline-flex items-center gap-2 hover:text-brand-200"><Icon name="phone" className="h-4 w-4" />۰۲۱-۹۱۰۰۰۰۰۰</a></li><li className="flex items-center gap-2"><Icon name="clock" className="h-4 w-4" />شنبه تا پنج‌شنبه، ۱۰ تا ۲۲</li></ul></div>
    </div>
    <div className="ui-container border-t border-white/15 py-5 pb-24 text-xs text-[#b8c5c6] md:pb-5">© {new Date().getFullYear()} آکادمی زیبایی فرشید معروف پور</div>
  </footer>;
}
