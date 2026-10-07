import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

export const HERO_SETTING_KEY = "hero";

export type HeroSettings = {
  headline: string;
  subtitle: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  mediaType: "image" | "video";
  desktopMediaUrl: string;
  mobileMediaUrl: string;
};

export const DEFAULT_HERO_SETTINGS: HeroSettings = {
  headline: "اصلاحی که به سبک تو می‌آید",
  subtitle: "خدمات پیرایش مردانه را با دیدن قیمت، مدت و تخصص آرایشگر انتخاب کن.",
  primaryCtaLabel: "رزرو نوبت",
  secondaryCtaLabel: "دیدن خدمات",
  mediaType: "video",
  desktopMediaUrl: "/video/barber-desktop.mp4",
  mobileMediaUrl: "/video/barber-mobile.mp4",
};

/** Read persisted Hero copy/media with safe, code-owned defaults. */
export async function getHeroSettings(): Promise<HeroSettings> {
  try {
    const [row] = await db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, HERO_SETTING_KEY))
      .limit(1);
    if (!row?.value) return DEFAULT_HERO_SETTINGS;

    const parsed: unknown = JSON.parse(row.value);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_HERO_SETTINGS;
    const input = parsed as Record<string, unknown>;
    const copy = (
      key: "headline" | "subtitle" | "primaryCtaLabel" | "secondaryCtaLabel",
      fallback: string,
      max: number,
    ) => {
      const value = input[key];
      return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
    };
    const mediaType = input.mediaType === "image" || input.mediaType === "video" ? input.mediaType : "video";
    const mediaUrl = (key: "desktopMediaUrl" | "mobileMediaUrl", fallback: string) => {
      const value = input[key];
      return typeof value === "string" && value.startsWith("/") && !value.includes("..") ? value : fallback;
    };

    return {
      headline: copy("headline", DEFAULT_HERO_SETTINGS.headline, 100),
      subtitle: copy("subtitle", DEFAULT_HERO_SETTINGS.subtitle, 220),
      primaryCtaLabel: copy("primaryCtaLabel", DEFAULT_HERO_SETTINGS.primaryCtaLabel, 36),
      secondaryCtaLabel: copy("secondaryCtaLabel", DEFAULT_HERO_SETTINGS.secondaryCtaLabel, 36),
      mediaType,
      desktopMediaUrl: mediaUrl("desktopMediaUrl", DEFAULT_HERO_SETTINGS.desktopMediaUrl),
      mobileMediaUrl: mediaUrl("mobileMediaUrl", DEFAULT_HERO_SETTINGS.mobileMediaUrl),
    };
  } catch {
    return DEFAULT_HERO_SETTINGS;
  }
}
