"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import type { HeroSettings } from "@/lib/hero-settings";

function videoMime(url: string): string {
  const extension = url.split(".").pop()?.toLowerCase();
  return extension === "webm" ? "video/webm" : extension === "mov" ? "video/quicktime" : "video/mp4";
}

export function HomeHero({ settings }: { settings: HeroSettings }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMessage, setPlaybackMessage] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      if (motionPreference.matches) {
        video.pause();
        setIsPlaying(false);
        return;
      }

      void video.play().then(() => {
        setIsPlaying(true);
        setPlaybackMessage("");
      }).catch(() => {
        setIsPlaying(false);
        setPlaybackMessage("برای پخش ویدئو، دکمهٔ پخش را انتخاب کنید.");
      });
    };

    syncPlayback();
    motionPreference.addEventListener("change", syncPlayback);
    return () => {
      motionPreference.removeEventListener("change", syncPlayback);
      video.pause();
    };
  }, []);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
        setPlaybackMessage("");
      } catch {
        setIsPlaying(false);
        setPlaybackMessage("ویدئو پخش نشد. دوباره تلاش کنید.");
      }
      return;
    }

    video.pause();
    setIsPlaying(false);
    setPlaybackMessage("ویدئو متوقف شد.");
  }

  return (
    <section
      id="home-hero"
      aria-labelledby="home-hero-title"
      className="home-hero relative isolate min-h-[100svh] overflow-hidden bg-[#10261b] text-white"
    >
      {settings.mediaType === "video" ? (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="metadata"
          poster="/images/video-poster.jpg"
          aria-hidden="true"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onError={() => {
            setIsPlaying(false);
            setPlaybackMessage("ویدئو در دسترس نیست. تصویر جایگزین نمایش داده می‌شود.");
          }}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source media="(max-width: 639px)" src={settings.mobileMediaUrl || settings.desktopMediaUrl} type={videoMime(settings.mobileMediaUrl || settings.desktopMediaUrl)} />
          <source src={settings.desktopMediaUrl} type={videoMime(settings.desktopMediaUrl)} />
          مرورگر شما از پخش ویدئو پشتیبانی نمی‌کند.
        </video>
      ) : (
        <div aria-hidden="true" className="absolute inset-0">
          <Image src={settings.mobileMediaUrl || settings.desktopMediaUrl} alt="" fill sizes="100vw" className="object-cover sm:hidden" />
          <Image src={settings.desktopMediaUrl} alt="" fill sizes="100vw" className="hidden object-cover sm:block" />
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-l from-[#07170f]/85 via-[#07170f]/55 to-[#07170f]/35"
      />
      <div className="home-hero-inner ui-container relative z-10 grid min-h-[100svh] content-center items-center gap-6 pt-24 pb-36 md:grid-cols-[0.9fr_1.1fr] md:gap-8 md:py-28 xl:gap-14">
        <div data-reveal="" className="min-w-0 max-w-xl text-right">
          <h1
            id="home-hero-title"
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] leading-[1.25] font-black tracking-tight text-white text-balance"
          >
            {settings.headline}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-8 text-white/90 sm:text-lg">
            {settings.subtitle}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/booking"
              className="focus-ring inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 text-sm font-bold text-[#10261b] transition-colors hover:bg-[#e3f0e9]"
            >
              {settings.primaryCtaLabel}
            </Link>
            <Link
              href="#services"
              className="focus-ring inline-flex min-h-12 items-center justify-center rounded-xl border border-white/70 bg-[#10261b]/35 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/15"
            >
              {settings.secondaryCtaLabel}
            </Link>
          </div>
          <p className="sr-only" role="status" aria-live="polite">{playbackMessage}</p>
        </div>

        <span className="sr-only">فرشید معروف پور</span>
      </div>
      {settings.mediaType === "video" && (
        <button
          type="button"
          onClick={() => void togglePlayback()}
          aria-label={isPlaying ? "توقف ویدئوی معرفی سالن" : "پخش ویدئوی معرفی سالن"}
          aria-pressed={isPlaying}
          className="focus-ring absolute bottom-24 left-4 z-20 inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/60 bg-[#10261b]/75 px-4 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-[#10261b] md:bottom-6 md:left-6"
        >
          <Icon name={isPlaying ? "pause" : "play"} className="h-4 w-4" weight="strong" />
          {isPlaying ? "توقف ویدئو" : "پخش ویدئو"}
        </button>
      )}
      <a
        href="#about"
        aria-label="رفتن به بخش بعدی"
        className="home-hero-scroll focus-ring absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 rounded-full border border-white/30 bg-[#07170f]/55 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm md:bottom-5"
      >
        <span>ادامه</span>
        <Icon name="chevron" aria-hidden="true" className="h-5 w-5" />
      </a>
      <span className="pointer-events-none absolute right-6 bottom-28 z-10 hidden text-sm font-semibold text-white drop-shadow sm:block md:bottom-6">
        فرشید معروف پور
      </span>
    </section>
  );
}
