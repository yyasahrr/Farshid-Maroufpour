import type { ReactNode } from "react";
import { MobileNav, SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ToastProvider } from "@/components/toast";
import { PublicChromeWrapper } from "@/components/layout/PublicChromeWrapper";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <PublicChromeWrapper
        header={<SiteHeader />}
        footer={<SiteFooter />}
        mobileNav={<MobileNav />}
      >
        {children}
      </PublicChromeWrapper>
    </ToastProvider>
  );
}
