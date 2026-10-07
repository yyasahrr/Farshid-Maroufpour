import type { Metadata } from "next";
import { CONTACT_ADDRESS, CONTACT_PHONE_TEL, SITE_NAME, SITE_NAME_EN, absoluteUrl } from "@/lib/site";
import { HomeHero } from "@/components/home/HomeHero";
import {
  HomeAcademy,
  HomeBookingCallout,
  HomePortfolio,
  HomeServices,
  HomeTeam,
  WhyChooseUs,
} from "@/components/home/HomePageSections";
import { getGalleryItems, getHomeBarbers, getServices } from "@/lib/queries";
import { getHeroSettings } from "@/lib/hero-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "صفحهٔ اصلی",
  description:
    "خدمات پیرایش مردانه، آرایشگران حرفه‌ای و دوره‌های تخصصی آکادمی زیبایی فرشید معروف پور.",
  alternates: { canonical: "/home" },
  openGraph: {
    title: "صفحهٔ اصلی | آکادمی زیبایی فرشید معروف پور",
    description:
      "خدمات پیرایش مردانه، آرایشگران حرفه‌ای و دوره‌های تخصصی آکادمی زیبایی فرشید معروف پور.",
    type: "website",
    siteName: SITE_NAME,
    locale: "fa_IR",
    url: "/home",
    images: [{ url: "/images/og-cover.jpg", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: "صفحهٔ اصلی | آکادمی زیبایی فرشید معروف پور",
    description:
      "خدمات پیرایش مردانه، آرایشگران حرفه‌ای و دوره‌های تخصصی آکادمی زیبایی فرشید معروف پور.",
    images: ["/images/og-cover.jpg"],
  },
};

export default async function HomePage() {
  const [services, barbers, portfolio, heroSettings] = await Promise.all([
    getServices(),
    getHomeBarbers(),
    getGalleryItems(4),
    getHeroSettings(),
  ]);

  return (
    <div className="min-h-screen bg-[#f6f5f1]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HealthAndBeautyBusiness",
            name: SITE_NAME,
            alternateName: SITE_NAME_EN,
            url: absoluteUrl("/home"),
            image: absoluteUrl("/images/og-cover.jpg"),
            address: {
              "@type": "PostalAddress",
              addressLocality: "تهران",
              streetAddress: CONTACT_ADDRESS,
            },
            telephone: CONTACT_PHONE_TEL,
            openingHours: "Sa-Th 10:00-22:00",
          }),
        }}
      />
      <HomeHero settings={heroSettings} />
      <WhyChooseUs />
      <HomeServices services={services} />
      <HomeTeam barbers={barbers} />
      <HomePortfolio items={portfolio} />
      <HomeAcademy />
      <HomeBookingCallout />
    </div>
  );
}
