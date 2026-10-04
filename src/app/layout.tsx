import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_NAME, SITE_NAME_EN, absoluteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  title: {
    default: `${SITE_NAME} | رزرو آنلاین و آکادمی`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "آکادمی زیبایی فرشید معروف پور — رزرو آنلاین نوبت، پروفایل حرفه‌ای آرایشگران و دوره‌های تخصصی آموزش.",
  applicationName: SITE_NAME_EN,
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_NAME,
    description: "رزرو آنلاین نوبت، آرایشگران حرفه‌ای و آکادمی تخصصی پیرایش.",
    type: "website",
    siteName: SITE_NAME,
    locale: "fa_IR",
    url: "/",
    images: [{ url: "/images/og-cover.jpg", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "رزرو آنلاین نوبت، آرایشگران حرفه‌ای و آکادمی تخصصی پیرایش.",
    images: ["/images/og-cover.jpg"],
  },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link
          rel="preload"
          href="/fonts/vazirmatn-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen antialiased">
        <a href="#main" className="skip-link">پرش به محتوای اصلی</a>
        {children}
      </body>
    </html>
  );
}
