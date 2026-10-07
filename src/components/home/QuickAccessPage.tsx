"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandMonogram, Icon, type IconName } from "@/components/icons";
import {
  BookingAuthModal,
  type AuthUser,
} from "@/components/booking/BookingAuthModal";
import { AtelierVideo } from "@/components/atelier-video";
import { heroIntro } from "@/components/motion";
import {
  CONTACT_ADDRESS,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_TEL,
  OPENING_HOURS,
} from "@/lib/site";

type Shortcut = {
  href: string;
  title: string;
  caption: string;
  icon: IconName;
  tone: "academy" | "shop" | "site";
};
/**
 * The hub holds exactly five destinations: booking (primary), the public site,
 * the shop, the academy and the address dialog. Nothing else belongs here —
 * a visitor should not have to read a menu to make one decision.
 */
const shortcuts: Shortcut[] = [
  {
    href: "/home",
    title: "وبسایت",
    caption: "درباره سالن و کارها",
    icon: "home",
    tone: "site",
  },
  {
    href: "/shop",
    title: "فروشگاه",
    caption: "محصولات پیرایش",
    icon: "diamond",
    tone: "shop",
  },
  {
    href: "/academy",
    title: "آکادمی",
    caption: "دوره‌های آموزشی",
    icon: "cap",
    tone: "academy",
  },
];

export function QuickAccessPage({
  initialUser,
  demoPhoneHint,
}: {
  initialUser: AuthUser | null;
  demoPhoneHint?: string;
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState(initialUser);
  const [authOpen, setAuthOpen] = useState(false);
  const [playVideo, setPlayVideo] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const contact = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = requestAnimationFrame(() => {
      if (!motion.matches) setPlayVideo(true);
    });
    const update = () => {
      if (motion.matches) setPlayVideo(false);
      else setPlayVideo(true);
    };
    motion.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return heroIntro(node);
  }, []);

  function book() {
    // Login is deliberately NOT required here: a visitor may browse services,
    // dates and complete time suggestions first, and only proves identity at the
    // moment a slot is held.
    router.push("/booking");
  }

  return (
    <div
      ref={root}
      className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-[#1f2e27] text-white"
    >
      <div
        className="absolute inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        <Image
          src="/images/video-poster.jpg"
          fill
          priority
          sizes="100vw"
          alt=""
          className="object-cover object-center"
        />
        {playVideo && !videoError && (
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/images/video-poster.jpg"
            onError={() => setVideoError(true)}
            className="absolute inset-0 h-full w-full object-cover object-center"
          >
            <source
              media="(max-width: 639px)"
              src="/video/barber-mobile.mp4"
              type="video/mp4"
            />
            <source src="/video/barber-desktop.mp4" type="video/mp4" />
          </video>
        )}
        <div className="absolute inset-0 bg-[#0a2318]/78" />
      </div>

      <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-5 lg:px-10">
        <Link
          href="/home"
          aria-label="فرشید معروف پور، صفحهٔ اصلی سایت"
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg text-xs font-black"
        >
          <BrandMonogram className="!h-8 !w-[24px]" />
          <span className="hidden sm:inline">فرشید معروف پور</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (user ? router.push("/account") : setAuthOpen(true))}
            className="focus-ring min-h-11 rounded-lg px-3 text-sm font-bold text-white/90"
          >
            {user ? "پنل من" : "ورود"}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-end px-4 pb-6 pt-12 text-right sm:px-8 sm:pb-8 lg:justify-center lg:px-10">
        <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-8">
          <div>
            <h1
              data-hero-title=""
              className="max-w-[820px] text-[clamp(30px,5vw,58px)] leading-[1.28] font-black tracking-tight text-balance"
            >
              {"استایل تو، در زمان تو".split(" ").map((word, i) => (
                <span
                  key={i}
                  className="inline-block overflow-hidden align-bottom"
                >
                  <span data-word="" className="inline-block">
                    {word}
                  </span>
                  {i < 3 ? " " : ""}
                </span>
              ))}
            </h1>
            <p
              data-hero-copy=""
              className="mt-2 max-w-2xl text-sm leading-7 font-semibold text-pretty text-[#dfe5e4] sm:text-base sm:leading-8"
            >
              وقت مناسب را انتخاب کنید؛ برای یادگیری و مراقبت از استایل هم کنار
              شماییم.
            </p>
          </div>
          <div data-hero-copy="" className="mt-2 lg:pb-1">
            <AtelierVideo />
          </div>
        </div>
      </main>

      <div className="mx-auto w-full max-w-[1280px] space-y-3 px-4 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-8 sm:pb-7 lg:px-10">
        <button
          type="button"
          onClick={book}
          data-hero-card=""
          className="focus-ring bento-card-interactive bento-shortcut-booking flex min-h-[120px] w-full items-center justify-between gap-4 rounded-[22px] p-5 text-right sm:p-6"
        >
          <div>
            <h2 className="mt-2 text-[23px] font-black leading-9 text-balance sm:text-[27px]">
              رزرو خدمات
            </h2>
            <p className="mt-1 text-sm leading-6 text-pretty text-[#eaf9f9]">
              خدمت و زمان مناسب خود را پیدا کنید.
            </p>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-white/20">
            <Icon name="scissors" className="h-7 w-7" weight="strong" />
          </span>
        </button>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {shortcuts.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              data-hero-card=""
              className={`focus-ring bento-card-interactive flex min-h-[112px] flex-col items-start justify-between rounded-[18px] p-4 text-right ${
                item.tone === "academy"
                  ? "bento-shortcut-academy"
                  : item.tone === "site"
                    ? "bento-shortcut-site"
                    : "bento-shortcut-shop"
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/70">
                <Icon name={item.icon} className="h-5 w-5" weight="strong" />
              </span>
              <span>
                <strong className="block text-base leading-7">
                  {item.title}
                </strong>
                <small className="block text-[12px] opacity-75">
                  {item.caption}
                </small>
              </span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => contact.current?.showModal()}
            data-hero-card=""
            className="focus-ring bento-card-interactive bento-shortcut-contact flex min-h-[112px] w-full flex-col items-start justify-between rounded-[18px] p-4 text-right"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/70">
              <Icon name="location" className="h-5 w-5" weight="strong" />
            </span>
            <span>
              <strong className="block text-base leading-7">آدرس و تماس</strong>
              <small className="block text-[12px] opacity-75">
                اطلاعات مراجعه
              </small>
            </span>
          </button>
        </div>
      </div>

      <BookingAuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={(signedIn) => {
          setUser(signedIn);
          setAuthOpen(false);
          router.refresh();
          router.push("/booking");
        }}
        demoPhoneHint={demoPhoneHint}
      />

      <dialog
        ref={contact}
        aria-labelledby="contact-title"
        className="auth-dialog w-[min(440px,calc(100vw-24px))] rounded-2xl border border-bone-150 bg-white p-6 text-bone-700 shadow-xl"
        onClick={(e) => {
          if (e.target === e.currentTarget) contact.current?.close();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="contact-title" className="text-xl font-black">
            آدرس و تماس
          </h2>
          <button
            type="button"
            onClick={() => contact.current?.close()}
            aria-label="بستن"
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-xl"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-6 flex items-start gap-2 text-sm leading-8">
          <Icon name="location" className="mt-1 h-5 w-5 text-brand-700" />
          {CONTACT_ADDRESS}
        </p>
        <p className="mt-3 flex items-center gap-2 text-sm">
          <Icon name="clock" className="h-5 w-5 text-brand-700" />
          {OPENING_HOURS}
        </p>
        <a
          href={`tel:${CONTACT_PHONE_TEL}`}
          dir="ltr"
          className="ui-button mt-6 w-full"
        >
          <Icon name="phone" className="h-5 w-5" />
          {CONTACT_PHONE_DISPLAY}
        </a>
      </dialog>
    </div>
  );
}
