"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SmoothScroll, ScrollReveals } from "@/components/motion";

export function PublicChromeWrapper({
  header,
  footer,
  mobileNav,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  mobileNav: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isQuickAccess = pathname === "/";
  const isMinimalFlow = pathname === "/booking";
  const isBooking = pathname === "/booking" || pathname === "/account" || pathname === "/pay";
  // Smooth scroll + scroll choreography only on brand-facing pages, never in
  // high-frequency booking and payment screens.
  const motionEnabled = !isMinimalFlow && !isBooking;

  const content = (
    isQuickAccess ? (
      <div className="min-h-screen">{children}</div>
    ) : (
      <div className="flex min-h-screen flex-col bg-bone-100">
        {!isMinimalFlow && header}
        <main className={`flex-1 ${!isMinimalFlow ? "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}>{children}</main>
        {!isMinimalFlow && footer}
        {!isMinimalFlow && mobileNav}
      </div>
    )
  );

  return motionEnabled && !isQuickAccess ? (
    <SmoothScroll>
      <ScrollReveals key={pathname} />
      {content}
    </SmoothScroll>
  ) : (
    content
  );
}
