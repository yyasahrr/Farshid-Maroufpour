import { z } from "zod";

const copyLine = (max: number) => z.string().trim().min(2).max(max);
const copyParagraph = (max: number) => z.string().trim().min(2).max(max);

export const HOME_CONTENT_SCHEMA = z
  .object({
    hero: z.object({
      headline: copyLine(100),
      subtitle: z.string().trim().max(220),
      primaryCtaLabel: z.string().trim().min(1).max(36),
      secondaryCtaLabel: z.string().trim().min(1).max(36),
      mediaType: z.enum(["image", "video"]),
      desktopMediaUrl: z.string().trim().min(1).max(500),
      mobileMediaUrl: z.string().trim().max(500),
    }),
    about: z.object({ heading: copyLine(80), body: copyParagraph(600) }),
    team: z.object({ heading: copyLine(80), body: copyParagraph(300) }),
    portfolio: z.object({ heading: copyLine(80), body: copyParagraph(300) }),
    academy: z.object({ heading: copyLine(100), body: copyParagraph(300) }),
    booking: z.object({ heading: copyLine(100), body: copyParagraph(300) }),
  })
  .strict();

export type HomeSiteContent = z.infer<typeof HOME_CONTENT_SCHEMA>;

export const DEFAULT_HOME_SITE_CONTENT: HomeSiteContent = {
  hero: {
    headline: "اصلاحی که به سبک تو می‌آید",
    subtitle: "خدمات پیرایش مردانه را با دیدن قیمت، مدت و تخصص آرایشگر انتخاب کن.",
    primaryCtaLabel: "رزرو نوبت",
    secondaryCtaLabel: "دیدن خدمات",
    mediaType: "video",
    desktopMediaUrl: "/video/barber-desktop.mp4",
    mobileMediaUrl: "/video/barber-mobile.mp4",
  },
  about: {
    heading: "دربارهٔ ما",
    body: "فرشید معروف پور، سالن پیرایش مردانه و آکادمی آموزش تخصصی را کنار هم گرد آورده است. خدمات، تخصص آرایشگران و دوره‌های آکادمی را بررسی کن و بعد مسیر مناسب خودت را انتخاب کن.",
  },
  team: {
    heading: "با تیم ما آشنا شو",
    body: "تخصص هر آرایشگر را ببین و کسی را انتخاب کن که با خواسته‌ات هماهنگ است.",
  },
  portfolio: {
    heading: "نمونه‌کارهای تیم",
    body: "سبک‌های ثبت‌شده توسط آرایشگران را ببین و برای آشنایی با هر متخصص، پروفایلش را باز کن.",
  },
  academy: {
    heading: "مهارت حرفه‌ای با تمرین ساخته می‌شود",
    body: "دوره‌ها و کارگاه‌های آکادمی را ببین و مسیر یادگیری پیرایش را شروع کن.",
  },
  booking: {
    heading: "برای انتخاب خدمت راهنمایی می‌خواهی؟",
    body: "پذیرش برای انتخاب خدمت یا آرایشگر راهنمایی‌ات می‌کند.",
  },
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov"]);

/** Only local, root-relative media URLs are accepted for editable Hero media. */
export function isSafeLocalMediaUrl(value: string, kind?: "image" | "video"): boolean {
  if (
    value.length > 500 ||
    !value.startsWith("/") ||
    value.includes("..") ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return false;
  }

  const match = /^\/(?:uploads|images|video)\/([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)\.([A-Za-z0-9]+)$/i.exec(value);
  if (!match) return false;
  const extension = match[2].toLowerCase();
  if (kind === "image") return IMAGE_EXTENSIONS.has(extension);
  if (kind === "video") return VIDEO_EXTENSIONS.has(extension);
  return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);
}

export function isValidHomeSiteContent(value: unknown): value is HomeSiteContent {
  const parsed = HOME_CONTENT_SCHEMA.safeParse(value);
  if (!parsed.success) return false;
  const { hero } = parsed.data;
  if (!isSafeLocalMediaUrl(hero.desktopMediaUrl, hero.mediaType)) return false;
  return isSafeLocalMediaUrl(hero.mobileMediaUrl || hero.desktopMediaUrl, hero.mediaType);
}

export function parseHomeSiteContent(value: unknown): HomeSiteContent | null {
  const parsed = HOME_CONTENT_SCHEMA.safeParse(value);
  return parsed.success && isValidHomeSiteContent(parsed.data) ? parsed.data : null;
}

export function parseHomeSiteContentJson(value: string | null | undefined): HomeSiteContent | null {
  if (!value) return null;
  try {
    return parseHomeSiteContent(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

type HomeDocumentPayload = {
  draftContent?: string | null;
  publishedContent?: string | null;
} | null | undefined;

/** Public pages deliberately read only `publishedContent`; a saved draft is never a fallback. */
export function resolvePublicHomeContent(document: HomeDocumentPayload): HomeSiteContent {
  return parseHomeSiteContentJson(document?.publishedContent) ?? DEFAULT_HOME_SITE_CONTENT;
}

/** The private editor may fall back to the last published revision when no draft exists. */
export function resolveDraftHomeContent(document: HomeDocumentPayload): HomeSiteContent {
  return (
    parseHomeSiteContentJson(document?.draftContent) ??
    parseHomeSiteContentJson(document?.publishedContent) ??
    DEFAULT_HOME_SITE_CONTENT
  );
}
