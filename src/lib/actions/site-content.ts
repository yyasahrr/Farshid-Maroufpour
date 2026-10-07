"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, siteSettings } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { HERO_SETTING_KEY } from "@/lib/hero-settings";

export type SiteContentActionResult = { ok: boolean; message: string };
const ok = (message: string): SiteContentActionResult => ({ ok: true, message });
const fail = (message: string): SiteContentActionResult => ({ ok: false, message });

function validMediaUrl(value: string, mediaType: "image" | "video"): boolean {
  if (!value || value.includes("..") || !/^\/(?:uploads|images|video)\/[a-zA-Z0-9/_-]+\.[a-z0-9]+$/i.test(value)) return false;
  const extension = value.split(".").pop()?.toLowerCase() ?? "";
  return mediaType === "image"
    ? ["jpg", "jpeg", "png", "webp", "avif"].includes(extension)
    : ["mp4", "webm", "mov"].includes(extension);
}

export async function saveHeroSettingsAction(
  _previous: SiteContentActionResult | null,
  formData: FormData,
): Promise<SiteContentActionResult> {
  const user = await getCurrentUser();
  if (!user?.permissions.has("settings:manage")) return fail("دسترسی غیرمجاز.");
  const parsed = z.object({
    headline: z.string().trim().min(2).max(100),
    subtitle: z.string().trim().max(220),
    primaryCtaLabel: z.string().trim().min(1).max(36),
    secondaryCtaLabel: z.string().trim().min(1).max(36),
    mediaType: z.enum(["image", "video"]),
    desktopMediaUrl: z.string().trim().max(500),
    mobileMediaUrl: z.string().trim().max(500).optional().default(""),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "اطلاعات هدر معتبر نیست.");
  const mobileMediaUrl = parsed.data.mobileMediaUrl || parsed.data.desktopMediaUrl;
  if (!validMediaUrl(parsed.data.desktopMediaUrl, parsed.data.mediaType)) return fail("رسانهٔ دسکتاپ با نوع انتخاب‌شده سازگار نیست؛ تصویر یا ویدیو را دوباره انتخاب کنید.");
  if (!validMediaUrl(mobileMediaUrl, parsed.data.mediaType)) return fail("رسانهٔ موبایل با نوع انتخاب‌شده سازگار نیست.");
  const value = JSON.stringify({ ...parsed.data, mobileMediaUrl });
  await db.insert(siteSettings).values({ key: HERO_SETTING_KEY, value }).onConflictDoUpdate({
    target: siteSettings.key,
    set: { value, updatedAt: new Date() },
  });
  await db.insert(auditLogs).values({ actor: `user:${user.id}`, action: "SITE_HERO_UPDATED", target: HERO_SETTING_KEY });
  revalidatePath("/");
  revalidatePath("/home");
  revalidatePath("/admin");
  return ok("محتوای هدر صفحهٔ اصلی ذخیره شد.");
}
