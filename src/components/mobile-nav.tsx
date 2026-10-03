"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  primary?: boolean;
};

const bookingItem: NavItem = {
  href: "/booking",
  label: "خدمات و رزرو",
  icon: "calendar",
  primary: true,
};

const publicNav: NavItem[] = [
  { href: "/home", label: "خانه", icon: "home" },
  { href: "/academy", label: "آکادمی", icon: "cap" },
  bookingItem,
  { href: "/shop", label: "فروشگاه", icon: "diamond" },
  { href: "/account", label: "حساب", icon: "user" },
];

const customerNav: NavItem[] = [
  { href: "/home", label: "خانه", icon: "home" },
  { href: "/account#bookings", label: "نوبت‌ها", icon: "clock" },
  bookingItem,
  { href: "/account#profile", label: "پروفایل", icon: "user" },
  { href: "/shop", label: "فروشگاه", icon: "diamond" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  const isCustomerPanel = pathname.startsWith("/account");
  const items = isCustomerPanel ? customerNav : publicNav;

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);

  return (
    <nav
      aria-label={isCustomerPanel ? "ناوبری پنل مشتری" : "ناوبری اصلی موبایل"}
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden"
    >
      <ul className="glass-floating mx-auto grid max-w-xl grid-cols-5 items-end gap-1 border border-white/70 px-2 pb-1 pt-2">
        {items.map((item) => {
          const isCurrent =
            (item.href === "/home" && pathname === "/home") ||
            (item.href === "/academy" && pathname.startsWith("/academy")) ||
            (item.href === "/shop" && pathname.startsWith("/shop")) ||
            (item.href === "/account" && isCustomerPanel) ||
            (item.href === "/account#bookings" &&
              isCustomerPanel &&
              (hash !== "#profile" || pathname === "/track")) ||
            (item.href === "/account#profile" &&
              isCustomerPanel &&
              hash === "#profile") ||
            (item.primary &&
              (pathname.startsWith("/booking") || pathname.startsWith("/services")));

          return (
            <li key={item.href + item.label} className="flex min-w-0 justify-center">
              <Link
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={
                  item.primary
                    ? "focus-ring relative -mt-7 flex min-h-[76px] min-w-0 flex-col items-center justify-end gap-1 rounded-2xl px-0.5 pb-0.5 text-center text-[9px] font-extrabold leading-tight text-[#1f2e27] motion-safe:transition-[scale] motion-safe:duration-100 motion-safe:active:scale-[0.96]"
                    : `focus-ring flex min-h-12 min-w-0 max-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-[10px] font-bold leading-tight motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:active:scale-[0.96] ${
                        isCurrent
                          ? "bg-[#e3f0e9] text-[#0f5a3b]"
                          : "text-[#535e66] hover:bg-[#f6f5f1]"
                      }`
                }
              >
                {item.primary ? (
                  <span className={`grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full border-[5px] border-[#fdfcf9] bg-[#0f5a3b] text-white shadow-[0_7px_18px_-5px_rgba(15,90,59,0.48),0_2px_5px_rgba(15,46,37,0.12)] ring-1 motion-safe:transition-[background-color,box-shadow,ring-color] motion-safe:duration-150 ${isCurrent ? "ring-[#0f5a3b]" : "ring-[#dfe7e1]"}`}>
                    <Icon name={item.icon} className="!h-6 !w-6" />
                  </span>
                ) : (
                  <Icon
                    name={item.icon}
                    className={`!h-5 !w-5 ${isCurrent ? "text-[#0f5a3b]" : ""}`}
                  />
                )}
                <span className="max-w-full whitespace-nowrap">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
