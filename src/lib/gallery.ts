export type GalleryItem = {
  id: number;
  title: string;
  category: string;
  imageUrl: string;
  barberName: string;
};

export const GALLERY_CATEGORY_LABELS: Record<string, string> = {
  FADE: "فید",
  CROP: "کراپ",
  BEARD: "ریش",
  CLASSIC: "کلاسیک",
  MODERN: "مدرن",
  LONG: "موی بلند",
  TEXTURED: "تکسچرد",
  TRANSFORMATION: "تغییر استایل",
  CREATIVE: "خلاقانه",
};

/** One shared option list for the public gallery and admin portfolio editor. */
export const GALLERY_CATEGORY_KEYS = Object.keys(GALLERY_CATEGORY_LABELS);

export function galleryCategoryLabel(category: string): string {
  return GALLERY_CATEGORY_LABELS[category] ?? category;
}
