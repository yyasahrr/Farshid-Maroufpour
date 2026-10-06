"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandMonogram, Icon } from "@/components/icons";

export type NavigationService = { id: number; name: string };
const links = [
  { href: "/services", label: "خدمات" },
  { href: "/barbers", label: "آرایشگران" },
  { href: "/academy", label: "آکادمی" },
  { href: "/shop", label: "فروشگاه" },
  { href: "/home#work", label: "نمونه‌کارها" },
  { href: "/home#about", label: "درباره ما" },
];

export function SiteNavigation({ services, panelHref, userName }: { services: NavigationService[]; panelHref: string; userName: string | null }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [heroVisible, setHeroVisible] = useState(pathname === "/home");
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const entries = [...links, { href: "/booking", label: "رزرو نوبت" }, { href: "/account", label: "نوبت‌های من" }, ...services.map((service) => ({ href: `/booking?services=${service.id}`, label: service.name }))];
  const results = entries.filter((entry) => entry.label.replace(/ي/g, "ی").includes(query.trim().replace(/ي/g, "ی")));

  useEffect(() => {
    if (pathname !== "/home") return;

    const hero = document.getElementById("home-hero");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { rootMargin: "-68px 0px 0px 0px" },
    );
    observer.observe(hero);

    return () => observer.disconnect();
  }, [pathname]);

  const homeHeader = pathname === "/home";
  const transparentHeader = homeHeader && heroVisible;
  const headerTextClass = transparentHeader ? "text-white" : "text-[#1f2e27]";
  const navigationLinkBase = transparentHeader
    ? "text-white/90 hover:text-white"
    : "text-[#535e66] hover:text-[#2f4a3a]";

  return (
    <>
      <header
        className={`sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ease-out ${
          homeHeader
            ? `-mb-[68px] ${heroVisible ? "border-white/15 bg-[#07170f]/55 backdrop-blur-sm" : "border-[#e2e5df] bg-[#ffffffec] backdrop-blur-md"}`
            : "border-[#e2e5df] bg-[#ffffffec] backdrop-blur-md"
        }`}
      >
        <nav aria-label="ناوبری سایت" className="ui-container flex h-[68px] items-center justify-between gap-2 sm:gap-4">
          <Link href="/home" aria-label="آکادمی زیبایی فرشید معروف پور؛ صفحهٔ اصلی" className={`focus-ring flex min-w-0 items-center gap-2 ${headerTextClass}`}>
            <BrandMonogram className="!h-9 !w-[27px] shrink-0" />
            <span className="truncate text-sm font-black sm:text-base">
              <span className="min-[400px]:hidden">فرشید</span>
              <span className="hidden min-[400px]:inline">فرشید معروف پور</span>
            </span>
          </Link>
          <ul className="hidden items-center gap-4 xl:flex">
            {links.map((item) => <li key={item.href}><Link href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={`focus-ring rounded-md px-1 py-2 text-sm font-semibold transition-colors ${navigationLinkBase} ${pathname === item.href && !transparentHeader ? "text-[#2f4a3a]" : ""}`}>{item.label}</Link></li>)}
          </ul>
          <div className="flex items-center gap-1 sm:gap-3">
            <button aria-label="جست‌وجو در سایت" type="button" onClick={() => dialog.current?.showModal()} className={`focus-ring flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${transparentHeader ? "text-white hover:bg-white/15" : "text-[#8a6a1e] hover:bg-[#eef0ec]"}`}><Icon name="search" className="h-5 w-5" /></button>
            <Link href={userName ? "/account" : panelHref} className={`focus-ring hidden min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors sm:flex ${transparentHeader ? "border-white/55 bg-[#10261b]/35 text-white hover:bg-white/15" : "border-[#e2e5df] text-[#1f2e27]"}`}><Icon name="user" className="h-4 w-4" />{userName ? "پنل من" : "ورود"}</Link>
            <Link href="/booking" className={`focus-ring inline-flex min-h-11 items-center justify-center rounded-xl px-2 text-xs font-bold transition-colors sm:px-5 sm:text-sm ${transparentHeader ? "bg-white text-[#10261b] hover:bg-[#e3f0e9]" : "ui-button !min-h-11 !px-2 !text-xs sm:!px-5 sm:!text-sm"}`}>رزرو نوبت</Link>
            <details ref={menu} className="relative xl:hidden">
              <summary aria-label="بازکردن فهرست" className={`focus-ring flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl transition-colors ${transparentHeader ? "text-white hover:bg-white/15" : "text-[#1f2e27] hover:bg-[#eef0ec]"}`}><Icon name="menu" className="h-5 w-5" /></summary>
              <div className="absolute left-0 top-12 z-50 max-h-[70svh] min-w-[220px] overflow-y-auto rounded-2xl border border-[#e2e5df] bg-white p-2 shadow-lg">
                {[...links, { href: "/account", label: "پنل من" }, { href: "/track", label: "پیگیری نوبت" }].map((item) => <Link key={item.href} href={item.href} onClick={() => { if (menu.current) menu.current.open = false; }} className="focus-ring block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-[#f6f5f1]">{item.label}</Link>)}
              </div>
            </details>
          </div>
        </nav>
      </header>
      <dialog ref={dialog} aria-labelledby="search-heading" className="auth-dialog w-[min(520px,calc(100vw-24px))] rounded-2xl border border-[#e2e5df] bg-white p-5 text-[#1f2e27] shadow-xl" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="mb-4 flex items-center justify-between"><h2 id="search-heading" className="text-lg font-black">دنبال چه می‌گردید؟</h2><button type="button" aria-label="بستن جست‌وجو" onClick={() => dialog.current?.close()} className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg"><Icon name="close" className="h-5 w-5" /></button></div>
        <label className="ui-label" htmlFor="site-search">جست‌وجوی خدمت یا صفحه</label>
        <input id="site-search" autoFocus className="ui-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً فید، آرایشگران، آموزش" />
        <div aria-live="polite" className="mt-3 max-h-[50svh] overflow-y-auto">
          {results.length ? results.map((item) => <Link key={item.href} href={item.href} onClick={() => dialog.current?.close()} className="flex min-h-11 items-center justify-between border-b border-[#e2e5df] px-2 text-sm hover:text-[#2f4a3a]"><span>{item.label}</span><Icon name="arrow" className="h-4 w-4" /></Link>) : <p className="py-5 text-sm text-[#5f7168]">نتیجه‌ای یافت نشد؛ عبارت دیگری وارد کنید.</p>}
        </div>
      </dialog>
    </>
  );
}
