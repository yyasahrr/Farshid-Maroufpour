import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { QuickAccessPage } from "@/components/home/QuickAccessPage";
import { demoPhoneHint } from "@/lib/preview";
import { getSiteContact } from "@/lib/site-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "دسترسی سریع",
  description: "رزرو خدمات، ورود به آکادمی و فروشگاه یا مراجعه به صفحهٔ اصلی سایت.",
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default async function QuickAccessRoute() {
  const [currentUser, contact] = await Promise.all([getCurrentUser(), getSiteContact()]);

  return (
    <QuickAccessPage
        contact={contact}
        demoPhoneHint={demoPhoneHint()}
        initialUser={
          currentUser
            ? {
                id: currentUser.id,
                name: currentUser.name,
                phone: currentUser.phone,
                role: currentUser.role,
              }
            : null
        }
      />
  );
}
