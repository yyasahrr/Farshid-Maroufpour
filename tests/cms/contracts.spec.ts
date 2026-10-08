import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { permissionsForRoles } from "../../src/lib/rbac";
import {
  DEFAULT_HOME_SITE_CONTENT,
  isSafeLocalMediaUrl,
  parseHomeSiteContent,
  resolveDraftHomeContent,
  resolvePublicHomeContent,
} from "../../src/lib/site-content-contract";
import {
  inspectMediaUpload,
  isSafeLegacyUploadName,
  isSafeStoredMediaKey,
  sanitizeOriginalMediaName,
} from "../../src/lib/media-validation";
import { mediaStorageRoot } from "../../src/lib/media-storage";

const root = process.cwd();

test("public content resolution uses the published revision and never falls back to a saved draft", () => {
  const draft = { ...DEFAULT_HOME_SITE_CONTENT, hero: { ...DEFAULT_HOME_SITE_CONTENT.hero, headline: "پیش‌نویس خصوصی" } };
  const published = { ...DEFAULT_HOME_SITE_CONTENT, hero: { ...DEFAULT_HOME_SITE_CONTENT.hero, headline: "نسخهٔ عمومی" } };
  const document = { draftContent: JSON.stringify(draft), publishedContent: JSON.stringify(published) };

  expect(resolvePublicHomeContent(document).hero.headline).toBe("نسخهٔ عمومی");
  expect(resolveDraftHomeContent(document).hero.headline).toBe("پیش‌نویس خصوصی");
  expect(resolvePublicHomeContent({ draftContent: JSON.stringify(draft), publishedContent: null }).hero.headline)
    .toBe(DEFAULT_HOME_SITE_CONTENT.hero.headline);
});

test("CMS content accepts safe local media URLs and rejects path traversal and external URLs", () => {
  expect(isSafeLocalMediaUrl("/uploads/barber-image.webp", "image")).toBe(true);
  expect(isSafeLocalMediaUrl("/video/desktop.mp4", "video")).toBe(true);
  expect(isSafeLocalMediaUrl("/uploads/../secrets.jpg", "image")).toBe(false);
  expect(isSafeLocalMediaUrl("/uploads/%2e%2e/secrets.jpg", "image")).toBe(false);
  expect(isSafeLocalMediaUrl("https://example.invalid/hero.jpg", "image")).toBe(false);
  expect(isSafeLocalMediaUrl("/uploads/movie.mp4", "image")).toBe(false);

  const unsafe = {
    ...DEFAULT_HOME_SITE_CONTENT,
    hero: { ...DEFAULT_HOME_SITE_CONTENT.hero, desktopMediaUrl: "/uploads/../secret.mp4" },
  };
  expect(parseHomeSiteContent(unsafe)).toBeNull();
});

test("upload validation binds extension, declared MIME, size, and file signature", () => {
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  expect(inspectMediaUpload("portrait.jpg", "image/jpeg", jpg.length, jpg).ok).toBe(true);
  expect(inspectMediaUpload("portrait.jpg", "image/png", jpg.length, jpg).ok).toBe(false);
  expect(inspectMediaUpload("fake.png", "image/png", jpg.length, jpg).ok).toBe(false);
  expect(inspectMediaUpload("movie.mp4", "video/mp4", 8, Buffer.from("0000ftyp")).ok).toBe(true);
  expect(inspectMediaUpload("movie.mov", "video/quicktime", 12, Buffer.from("0000ftypqt  ")).ok).toBe(true);
  expect(inspectMediaUpload("archive.svg", "image/svg+xml", 4, Buffer.from("<svg")).ok).toBe(false);
  expect(inspectMediaUpload("large.jpg", "image/jpeg", 5 * 1024 * 1024 + 1, jpg).ok).toBe(false);
  expect(inspectMediaUpload("clip.mp4", "video/mp4", 8, Buffer.from("0000ftyp"), false).ok).toBe(false);
});

test("media names and storage keys cannot become filesystem paths", () => {
  expect(sanitizeOriginalMediaName("C:\\private\\portrait.jpg")).toBe("portrait.jpg");
  expect(sanitizeOriginalMediaName("../portrait.jpg")).toBe("portrait.jpg");
  expect(isSafeStoredMediaKey("1b5f8a2e-1c13-4d72-9a42-000000000001.jpg")).toBe(true);
  expect(isSafeStoredMediaKey("../../secrets.jpg")).toBe(false);
  expect(isSafeLegacyUploadName("old-photo_2.webp")).toBe(true);
  expect(isSafeLegacyUploadName("../old-photo.webp")).toBe(false);
  expect(isSafeLegacyUploadName("folder/photo.webp")).toBe(false);
});

test("media storage uses a private default and rejects unsafe configured roots", () => {
  const previousRoot = process.env.MEDIA_STORAGE_DIR;
  try {
    delete process.env.MEDIA_STORAGE_DIR;
    expect(mediaStorageRoot()).toBe(path.join(root, "var", "media"));

    process.env.MEDIA_STORAGE_DIR = path.join(root, "var", "persistent-media");
    expect(mediaStorageRoot()).toBe(path.join(root, "var", "persistent-media"));

    process.env.MEDIA_STORAGE_DIR = path.join(root, "public", "uploads");
    expect(() => mediaStorageRoot()).toThrow("MEDIA_STORAGE_DIR_MUST_BE_OUTSIDE_PUBLIC");

    process.env.MEDIA_STORAGE_DIR = "var/media";
    expect(() => mediaStorageRoot()).toThrow("MEDIA_STORAGE_DIR_MUST_BE_ABSOLUTE");
  } finally {
    if (previousRoot === undefined) delete process.env.MEDIA_STORAGE_DIR;
    else process.env.MEDIA_STORAGE_DIR = previousRoot;
  }
});

test("CMS roles follow the existing settings permission rather than client-side UI", () => {
  expect(permissionsForRoles(["MANAGER"]).has("settings:manage")).toBe(true);
  expect(permissionsForRoles(["SUPER_ADMIN"]).has("settings:manage")).toBe(true);
  expect(permissionsForRoles(["RECEPTIONIST"]).has("settings:manage")).toBe(false);
  expect(permissionsForRoles(["BARBER"]).has("settings:manage")).toBe(false);
});

test("the forward migration adds public visibility without removing existing portfolio rows", () => {
  const journal = JSON.parse(readFileSync(path.join(root, "drizzle/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  expect(journal.entries.map((entry) => entry.idx)).toEqual(journal.entries.map((_, index) => index));
  for (const entry of journal.entries) expect(existsSync(path.join(root, "drizzle", `${entry.tag}.sql`))).toBe(true);

  const migration = readFileSync(path.join(root, "drizzle/0004_cms_media_visibility.sql"), "utf8");
  expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS "is_public" boolean NOT NULL DEFAULT true/i);
  expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS "featured" boolean NOT NULL DEFAULT false/i);
  expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS "site_content_documents"/i);
  expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS "media_assets"/i);
  expect(migration).not.toMatch(/\b(DROP TABLE|TRUNCATE|DELETE FROM)\b/i);
});
