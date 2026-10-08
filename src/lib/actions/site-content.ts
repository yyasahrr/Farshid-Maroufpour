"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  barbers,
  mediaAssets,
  portfolioItems,
  siteContentDocuments,
  siteSettings,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getHomeContentSnapshot, HOME_CONTENT_SLUG } from "@/lib/home-content";
import { isValidHomeSiteContent, HOME_CONTENT_SCHEMA, type HomeSiteContent } from "@/lib/site-content-contract";
import { isSafeStoredMediaKey } from "@/lib/media-validation";
import { finalizeQuarantinedMediaFile, quarantineMediaFile, restoreQuarantinedMediaFile } from "@/lib/media-storage";

export type SiteContentActionResult = { ok: boolean; message: string };
const ok = (message: string): SiteContentActionResult => ({ ok: true, message });
const fail = (message: string): SiteContentActionResult => ({ ok: false, message });

const editorFields = {
  hero: {
    headline: "hero.headline",
    subtitle: "hero.subtitle",
    primaryCtaLabel: "hero.primaryCtaLabel",
    secondaryCtaLabel: "hero.secondaryCtaLabel",
    mediaType: "hero.mediaType",
    desktopMediaUrl: "hero.desktopMediaUrl",
    mobileMediaUrl: "hero.mobileMediaUrl",
  },
  about: { heading: "about.heading", body: "about.body" },
  team: { heading: "team.heading", body: "team.body" },
  portfolio: { heading: "portfolio.heading", body: "portfolio.body" },
  academy: { heading: "academy.heading", body: "academy.body" },
  booking: { heading: "booking.heading", body: "booking.body" },
} as const;

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function homeContentFromForm(formData: FormData): HomeSiteContent | null {
  const raw = Object.fromEntries(
    Object.entries(editorFields).map(([section, fields]) => [
      section,
      Object.fromEntries(Object.entries(fields).map(([field, name]) => [field, formString(formData, name)])),
    ]),
  );
  const parsed = HOME_CONTENT_SCHEMA.safeParse(raw);
  if (!parsed.success || !isValidHomeSiteContent(parsed.data)) return null;
  return {
    ...parsed.data,
    hero: {
      ...parsed.data.hero,
      mobileMediaUrl: parsed.data.hero.mobileMediaUrl || parsed.data.hero.desktopMediaUrl,
    },
  };
}

async function canManageContent() {
  const user = await getCurrentUser();
  return user?.permissions.has("settings:manage") ? user : null;
}

async function storeHomeDraft(content: HomeSiteContent, actorId: number) {
  const draftContent = JSON.stringify(content);
  await db.transaction(async (tx) => {
    await tx
      .insert(siteContentDocuments)
      .values({ slug: HOME_CONTENT_SLUG, title: "صفحهٔ اصلی", draftContent, updatedBy: actorId })
      .onConflictDoUpdate({
        target: siteContentDocuments.slug,
        set: {
          title: "صفحهٔ اصلی",
          draftContent,
          draftVersion: sql`${siteContentDocuments.draftVersion} + 1`,
          updatedBy: actorId,
          updatedAt: new Date(),
        },
      });
    await tx.insert(auditLogs).values({
      actor: `user:${actorId}`,
      action: "SITE_CONTENT_DRAFT_SAVED",
      target: `${HOME_CONTENT_SLUG}:draft`,
    });
  });
}

export async function saveHomeContentDraftAction(
  _previous: SiteContentActionResult | null,
  formData: FormData,
): Promise<SiteContentActionResult> {
  const user = await canManageContent();
  if (!user) return fail("دسترسی غیرمجاز.");
  const content = homeContentFromForm(formData);
  if (!content) return fail("اطلاعات محتوا یا مسیر رسانه معتبر نیست؛ فایل محلی تصویر یا ویدیو را دوباره بررسی کنید.");

  try {
    await storeHomeDraft(content, user.id);
    revalidatePath("/admin/site-content");
    return ok("پیش‌نویس ذخیره شد؛ تا زمان انتشار تغییری در سایت عمومی دیده نمی‌شود.");
  } catch {
    return fail("ذخیرهٔ پیش‌نویس انجام نشد. وضعیت پایگاه‌داده و اجرای مهاجرت CMS را بررسی کنید.");
  }
}

/** Compatibility for the legacy Hero form: it can save a draft, never publish one. */
export async function saveHeroSettingsAction(
  _previous: SiteContentActionResult | null,
  formData: FormData,
): Promise<SiteContentActionResult> {
  const user = await canManageContent();
  if (!user) return fail("دسترسی غیرمجاز.");
  const snapshot = await getHomeContentSnapshot();
  const hero = {
    headline: formString(formData, "headline"),
    subtitle: formString(formData, "subtitle"),
    primaryCtaLabel: formString(formData, "primaryCtaLabel"),
    secondaryCtaLabel: formString(formData, "secondaryCtaLabel"),
    mediaType: formString(formData, "mediaType"),
    desktopMediaUrl: formString(formData, "desktopMediaUrl"),
    mobileMediaUrl: formString(formData, "mobileMediaUrl") || formString(formData, "desktopMediaUrl"),
  };
  const parsed = HOME_CONTENT_SCHEMA.safeParse({ ...snapshot.draft, hero });
  if (!parsed.success || !isValidHomeSiteContent(parsed.data))
    return fail("اطلاعات هدر یا مسیر رسانه معتبر نیست؛ فایل محلی را دوباره بررسی کنید.");
  try {
    await storeHomeDraft(parsed.data, user.id);
    revalidatePath("/admin/site-content");
    return ok("پیش‌نویس هدر ذخیره شد؛ برای نمایش عمومی آن را جداگانه منتشر کنید.");
  } catch {
    return fail("ذخیرهٔ پیش‌نویس هدر انجام نشد. وضعیت پایگاه‌داده و اجرای مهاجرت CMS را بررسی کنید.");
  }
}

export async function publishHomeContentAction(
  _previous: SiteContentActionResult | null,
  _formData: FormData,
): Promise<SiteContentActionResult> {
  const user = await canManageContent();
  if (!user) return fail("دسترسی غیرمجاز.");

  try {
    const [document] = await db
      .select()
      .from(siteContentDocuments)
      .where(eq(siteContentDocuments.slug, HOME_CONTENT_SLUG))
      .limit(1);
    if (!document) return fail("ابتدا پیش‌نویس صفحهٔ اصلی را ذخیره کنید.");
    const parsed = HOME_CONTENT_SCHEMA.safeParse(JSON.parse(document.draftContent) as unknown);
    if (!parsed.success || !isValidHomeSiteContent(parsed.data)) return fail("پیش‌نویس معتبر نیست؛ آن را بازبینی و دوباره ذخیره کنید.");

    const publishedContent = JSON.stringify({
      ...parsed.data,
      hero: {
        ...parsed.data.hero,
        mobileMediaUrl: parsed.data.hero.mobileMediaUrl || parsed.data.hero.desktopMediaUrl,
      },
    });
    const publishedAt = new Date();
    const result = await db.transaction(async (tx) => {
      const updated = await tx
        .update(siteContentDocuments)
        .set({
          publishedContent,
          publishedVersion: document.draftVersion,
          publishedAt,
          publishedBy: user.id,
          updatedBy: user.id,
          updatedAt: publishedAt,
        })
        .where(and(eq(siteContentDocuments.id, document.id), eq(siteContentDocuments.draftVersion, document.draftVersion)))
        .returning({ id: siteContentDocuments.id });
      if (!updated.length) return false;
      await tx.insert(auditLogs).values({
        actor: `user:${user.id}`,
        action: "SITE_CONTENT_PUBLISHED",
        target: `${HOME_CONTENT_SLUG}:v${document.draftVersion}`,
      });
      return true;
    });
    if (!result) return fail("پیش‌نویس هنگام انتشار تغییر کرد؛ صفحه را تازه‌سازی و دوباره منتشر کنید.");

    for (const route of ["/", "/home", "/barbers", "/work", "/admin/site-content"]) revalidatePath(route);
    return ok("محتوای صفحهٔ اصلی منتشر شد.");
  } catch {
    return fail("انتشار انجام نشد. وضعیت پیش‌نویس، پایگاه‌داده و اجرای مهاجرت CMS را بررسی کنید.");
  }
}

export async function setFeaturedBarberAction(
  _previous: SiteContentActionResult | null,
  formData: FormData,
): Promise<SiteContentActionResult> {
  const user = await canManageContent();
  if (!user) return fail("دسترسی غیرمجاز.");
  const rawId = String(formData.get("barberId") ?? "");
  const barberId = rawId === "" || rawId === "none" ? null : Number(rawId);
  if (barberId !== null && (!Number.isSafeInteger(barberId) || barberId <= 0)) return fail("آرایشگر انتخاب‌شده معتبر نیست.");

  try {
    await db.transaction(async (tx) => {
      if (barberId !== null) {
        const [barber] = await tx.select({ id: barbers.id, active: barbers.active }).from(barbers).where(eq(barbers.id, barberId)).limit(1);
        if (!barber || !barber.active) throw new Error("FEATURED_BARBER_INACTIVE");
      }
      await tx.update(barbers).set({ featured: false }).where(eq(barbers.featured, true));
      if (barberId !== null) await tx.update(barbers).set({ featured: true }).where(eq(barbers.id, barberId));
      await tx.insert(auditLogs).values({
        actor: `user:${user.id}`,
        action: "FEATURED_BARBER_UPDATED",
        target: barberId === null ? "none" : `barber:${barberId}`,
      });
    });
    for (const route of ["/", "/home", "/barbers", "/admin/site-content"]) revalidatePath(route);
    return ok(barberId === null ? "آرایشگر ویژه برداشته شد." : "آرایشگر ویژهٔ صفحهٔ اصلی به‌روز شد.");
  } catch (error) {
    return error instanceof Error && error.message === "FEATURED_BARBER_INACTIVE"
      ? fail("فقط پروفایل فعال را می‌توان به‌عنوان آرایشگر ویژه انتخاب کرد.")
      : fail("ذخیرهٔ آرایشگر ویژه انجام نشد.");
  }
}

export async function deleteMediaAssetAction(
  _previous: SiteContentActionResult | null,
  formData: FormData,
): Promise<SiteContentActionResult> {
  const user = await canManageContent();
  if (!user) return fail("دسترسی غیرمجاز.");
  const id = Number(formData.get("mediaId"));
  if (!Number.isSafeInteger(id) || id <= 0) return fail("رسانهٔ انتخاب‌شده معتبر نیست.");

  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset || !isSafeStoredMediaKey(asset.storageKey)) return fail("رسانه پیدا نشد یا مسیر آن معتبر نیست.");
  const publicUrl = `/uploads/${asset.storageKey}`;

  try {
    const [portfolioReference, barberReference, contentRows, settingRows] = await Promise.all([
      db.select({ id: portfolioItems.id }).from(portfolioItems).where(eq(portfolioItems.imageUrl, publicUrl)).limit(1),
      db.select({ id: barbers.id }).from(barbers).where(eq(barbers.imageUrl, publicUrl)).limit(1),
      db.select({ draftContent: siteContentDocuments.draftContent, publishedContent: siteContentDocuments.publishedContent }).from(siteContentDocuments),
      db.select({ value: siteSettings.value }).from(siteSettings),
    ]);
    const referenced = portfolioReference.length > 0 || barberReference.length > 0 ||
      contentRows.some((row) => row.draftContent.includes(publicUrl) || (row.publishedContent ?? "").includes(publicUrl)) ||
      settingRows.some((row) => row.value.includes(publicUrl));
    if (referenced) return fail("این رسانه در یک پروفایل، نمونه‌کار یا محتوای پیش‌نویس/منتشرشده استفاده می‌شود؛ ابتدا آن را از آن بخش جدا کنید.");

    const quarantined = await quarantineMediaFile(asset.storageKey);
    if (!quarantined) return fail("فایل اصلی پیدا نشد یا قابل حذف امن نبود؛ رکورد کتابخانه حفظ شد.");
    try {
      const deleted = await db.transaction(async (tx) => {
        const removed = await tx.delete(mediaAssets).where(eq(mediaAssets.id, asset.id)).returning({ id: mediaAssets.id });
        if (!removed.length) return false;
        await tx.insert(auditLogs).values({
          actor: `user:${user.id}`,
          action: "MEDIA_ASSET_DELETED",
          target: `media:${asset.id}`,
        });
        return true;
      });
      if (!deleted) {
        await restoreQuarantinedMediaFile(quarantined);
        return fail("رسانه پیش از حذف تغییر کرد؛ فایل اصلی بازیابی شد و دوباره بررسی کنید.");
      }
      const fileRemoved = await finalizeQuarantinedMediaFile(quarantined);
      revalidatePath("/admin/site-content/media");
      return ok(fileRemoved
        ? "رسانهٔ بدون ارجاع از کتابخانه و ذخیره‌گاه حذف شد."
        : "رسانه از کتابخانه و دسترس عمومی حذف شد؛ پاک‌سازی نهایی فایل‌سیستم نیازمند بررسی مدیر است.");
    } catch {
      const restored = await restoreQuarantinedMediaFile(quarantined);
      return fail(restored
        ? "حذف پایگاه‌داده انجام نشد؛ فایل اصلی بازیابی شد و رکورد کتابخانه حفظ شد."
        : "حذف پایگاه‌داده انجام نشد و بازیابی فایل خودکار ناموفق بود؛ ذخیره‌گاه رسانه را بررسی کنید.");
    }
  } catch {
    return fail("بررسی ایمنی رسانه انجام نشد؛ فایل و رکورد کتابخانه دست‌نخورده باقی ماند.");
  }
}
