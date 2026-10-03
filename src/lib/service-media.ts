const images: Record<string, string> = {
  haircut: "/images/svc-haircut.jpg",
  "skin-fade": "/images/svc-fade.jpg",
  beard: "/images/svc-beard.jpg",
  combo: "/images/svc-grooming.jpg",
  color: "/images/svc-fade.jpg",
};

/** Neutral on-brand tile shown when a record carries no usable image URL. */
export const PLACEHOLDER_IMAGE = "/images/placeholder.jpg";

export function serviceImage(slug: string): string {
  return images[slug] ?? "/images/svc-grooming.jpg";
}

/**
 * Guards stored image URLs: empty or whitespace-only values fall back to the
 * shared tile so cards never render a broken `<img>`.
 */
export function safeImageUrl(url: string | null | undefined, fallback: string = PLACEHOLDER_IMAGE): string {
  const value = (url ?? "").trim();
  return value.length > 0 ? value : fallback;
}

/** next/image needs `unoptimized` only for remote URLs the optimizer cannot fetch locally. */
export function isRemoteImage(url: string): boolean {
  return !url.startsWith("/");
}
