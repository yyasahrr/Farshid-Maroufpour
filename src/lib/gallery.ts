export type GalleryItem = {
  id: number;
  title: string;
  category: string;
  imageUrl: string;
  barberName: string;
};

const categoryLabels: Record<string, string> = {
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

export function galleryCategoryLabel(category: string): string {
  return categoryLabels[category] ?? category;
}
