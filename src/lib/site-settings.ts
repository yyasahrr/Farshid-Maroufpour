/**
 * Admin-editable site settings with a constants fallback (src/lib/site.ts), so
 * the app renders identically before the DB row exists. The "contact" row
 * carries the salon address plus Neshan coordinates; the Neshan web-services
 * key lives in the environment only (never stored, never sent to the browser).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { CONTACT_ADDRESS } from "@/lib/site";

export type SiteContact = {
  address: string;
  lat: number | null;
  lng: number | null;
};

export const CONTACT_SETTING_KEY = "contact";

export async function getSiteContact(): Promise<SiteContact> {
  const fallback: SiteContact = { address: CONTACT_ADDRESS, lat: null, lng: null };
  try {
    const [row] = await db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, CONTACT_SETTING_KEY))
      .limit(1);
    if (!row?.value) return fallback;
    const parsed: unknown = JSON.parse(row.value);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const obj = parsed as Record<string, unknown>;
    return {
      address: typeof obj.address === "string" && obj.address.trim() ? obj.address.trim() : fallback.address,
      lat: typeof obj.lat === "number" && Number.isFinite(obj.lat) ? obj.lat : null,
      lng: typeof obj.lng === "number" && Number.isFinite(obj.lng) ? obj.lng : null,
    };
  } catch {
    return fallback;
  }
}

/* ---------------- Neshan (نشان) ---------------- */

export function neshanApiKey(): string | null {
  const key = process.env.NESHAN_API_KEY?.trim();
  return key && key.length >= 8 ? key : null;
}

export type NeshanPlace = {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
};

/** Server-side proxy for https://api.neshan.org/v5/search — the key never
 *  reaches the client. Empty list (not an error) when no key is configured. */
export async function neshanSearch(query: string): Promise<{ ok: true; items: NeshanPlace[]; enabled: boolean } | { ok: false; error: string }> {
  const key = neshanApiKey();
  if (!key) return { ok: true, items: [], enabled: false };
  const url = `https://api.neshan.org/v5/search?text=${encodeURIComponent(query)}&size=8`;
  try {
    const res = await fetch(url, { headers: { "Api-Key": key }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return res.status === 401 || res.status === 403
      ? { ok: false, error: "کلید نشان معتبر نیست؛ متغیر محیطی NESHAN_API_KEY را بررسی کنید." }
      : { ok: false, error: "سرویس نشان موقتاً در دسترس نیست." };
    const json: unknown = await res.json();
    if (!Array.isArray(json)) return { ok: true, items: [], enabled: true };
    const items: NeshanPlace[] = [];
    for (const raw of json) {
      if (typeof raw !== "object" || raw === null) continue;
      const p = raw as Record<string, unknown>;
      const loc = p.location as Record<string, unknown> | undefined;
      if (typeof p.id !== "string" || typeof p.title !== "string" || !loc) continue;
      items.push({
        id: p.id,
        title: p.title,
        description: typeof p.description === "string" ? p.description : "",
        lat: Number(loc.lat),
        lng: Number(loc.lng),
      });
    }
    return { ok: true, items: items.filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng)), enabled: true };
  } catch {
    return { ok: false, error: "ارتباط با نشان برقرار نشد." };
  }
}

/** Deep link that opens the place inside the Neshan app (or its web map). */
export function neshanPlaceLink(contact: SiteContact): string | null {
  if (contact.lat === null || contact.lng === null) return null;
  return `https://neshan.org/link/place?ll=${contact.lat},${contact.lng}&z=17&src=farshid-academy`;
}

/** Static map thumbnail (works without a key? No — needs the same key; the
 *  caller only embeds it server-side where the key is available). */
export function neshanStaticMapUrl(contact: SiteContact, size = "640x260"): string | null {
  const key = neshanApiKey();
  if (!key || contact.lat === null || contact.lng === null) return null;
  return `https://static.neshan.org/v1/map/standard/${contact.lat},${contact.lng},16,${size}?apiKey=${encodeURIComponent(key)}`;
}
