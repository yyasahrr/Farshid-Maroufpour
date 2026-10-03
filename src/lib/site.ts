/**
 * Single source of truth for brand details, contact points and the canonical URL.
 * Used by metadata, robots.txt, the sitemap and the pages that surface contact info,
 * so a phone/address change only happens in one place.
 */

export const SITE_NAME = "آکادمی زیبایی فرشید معروف پور";
export const SITE_NAME_EN = "Farshid Maroufpour Beauty Academy";
export const CONTACT_PHONE_TEL = "+982191000000";
export const CONTACT_PHONE_DISPLAY = "۰۲۱-۹۱۰۰۰۰۰۰";
export const CONTACT_ADDRESS = "تهران، خیابان ولیعصر، پلاک ۱۲";
export const OPENING_HOURS = "شنبه تا پنج‌شنبه، ۱۰ تا ۲۲";
export const CONTACT_EMAIL = "hello@farshidmaroufpour.example";

/** Absolute base URL. Set NEXT_PUBLIC_SITE_URL in production deployments. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return "http://localhost:5000";
  return configured.replace(/\/+$/, "");
}

export function absoluteUrl(path = "/"): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
