import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Crawlers may index the brand pages; staff panels, checkout and APIs stay out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/barber", "/account", "/pay", "/api/"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
