import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteContentDocuments } from "@/db/schema";
import { getLegacyHeroSettings } from "@/lib/hero-settings";
import {
  DEFAULT_HOME_SITE_CONTENT,
  parseHomeSiteContentJson,
  resolveDraftHomeContent,
  resolvePublicHomeContent,
  type HomeSiteContent,
} from "@/lib/site-content-contract";

export const HOME_CONTENT_SLUG = "home";

async function loadHomeDocument() {
  try {
    const [row] = await db
      .select({
        draftContent: siteContentDocuments.draftContent,
        publishedContent: siteContentDocuments.publishedContent,
        draftVersion: siteContentDocuments.draftVersion,
        publishedVersion: siteContentDocuments.publishedVersion,
        updatedAt: siteContentDocuments.updatedAt,
        publishedAt: siteContentDocuments.publishedAt,
      })
      .from(siteContentDocuments)
      .where(eq(siteContentDocuments.slug, HOME_CONTENT_SLUG))
      .limit(1);
    return row ?? null;
  } catch {
    // A rolling deploy or an unmigrated local database should keep the legacy
    // Hero and code-owned copy available instead of taking the public site down.
    return null;
  }
}

export type HomeContentSnapshot = {
  draft: HomeSiteContent;
  published: HomeSiteContent;
  hasDraft: boolean;
  draftVersion: number;
  publishedVersion: number | null;
  updatedAt: Date | null;
  publishedAt: Date | null;
};

export async function getHomeContentSnapshot(): Promise<HomeContentSnapshot> {
  const document = await loadHomeDocument();
  const parsedPublished = parseHomeSiteContentJson(document?.publishedContent);
  const parsedDraft = parseHomeSiteContentJson(document?.draftContent);
  const legacyHero = !parsedPublished && !parsedDraft ? await getLegacyHeroSettings() : null;
  const published = parsedPublished
    ? resolvePublicHomeContent(document)
    : { ...DEFAULT_HOME_SITE_CONTENT, ...(legacyHero ? { hero: legacyHero } : {}) };
  const draft = parsedDraft
    ? resolveDraftHomeContent(document)
    : published;

  return {
    draft,
    published,
    hasDraft: Boolean(parsedDraft),
    draftVersion: document?.draftVersion ?? 0,
    publishedVersion: document?.publishedVersion ?? null,
    updatedAt: document?.updatedAt ?? null,
    publishedAt: document?.publishedAt ?? null,
  };
}

/** Public home content is resolved solely from a published revision. */
export async function getPublishedHomeContent(): Promise<HomeSiteContent> {
  const document = await loadHomeDocument();
  const parsedPublished = parseHomeSiteContentJson(document?.publishedContent);
  if (parsedPublished) return resolvePublicHomeContent(document);

  const legacyHero = await getLegacyHeroSettings();
  return { ...DEFAULT_HOME_SITE_CONTENT, hero: legacyHero };
}
