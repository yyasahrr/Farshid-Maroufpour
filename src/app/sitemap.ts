import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { barbers, services } from "@/db/schema";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 3600;

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/home", priority: 1, changeFrequency: "weekly" },
  { path: "/booking", priority: 0.9, changeFrequency: "weekly" },
  { path: "/services", priority: 0.8, changeFrequency: "weekly" },
  { path: "/barbers", priority: 0.8, changeFrequency: "weekly" },
  { path: "/academy", priority: 0.7, changeFrequency: "weekly" },
  { path: "/shop", priority: 0.6, changeFrequency: "weekly" },
  { path: "/work", priority: 0.6, changeFrequency: "weekly" },
  { path: "/track", priority: 0.4, changeFrequency: "monthly" },
];

/**
 * Brand pages plus every bookable service and active barber profile.
 * Slug lookups are best-effort: an unavailable database yields the static routes
 * instead of failing the whole sitemap.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const [serviceRows, barberRows] = await Promise.all([
      db.select({ slug: services.slug }).from(services),
      db.select({ slug: barbers.slug }).from(barbers).where(eq(barbers.active, true)),
    ]);
    for (const row of serviceRows)
      entries.push({ url: absoluteUrl(`/services/${row.slug}`), lastModified, changeFrequency: "weekly", priority: 0.7 });
    for (const row of barberRows)
      entries.push({ url: absoluteUrl(`/barbers/${row.slug}`), lastModified, changeFrequency: "weekly", priority: 0.7 });
  } catch {
    // Static routes are still a valid sitemap; the database may be mid-migration.
  }

  return entries;
}
