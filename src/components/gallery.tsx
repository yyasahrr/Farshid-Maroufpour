"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui-cards";
import { galleryCategoryLabel, type GalleryItem } from "@/lib/gallery";
import { isRemoteImage, safeImageUrl } from "@/lib/service-media";

export function Gallery({ items }: { items: GalleryItem[] }) {
  const [category, setCategory] = useState("ALL");
  const categories = useMemo(() => ["ALL", ...new Set(items.map((item) => item.category))], [items]);
  const visible = category === "ALL" ? items : items.filter((item) => item.category === category);
  if (!items.length) return <EmptyState title="هنوز نمونه‌ای ثبت نشده است" description="بعداً دوباره به این صفحه سر بزنید." />;
  return <div>
    <div role="group" aria-label="دسته‌بندی نمونه‌ها" className="hide-scrollbar flex gap-2 overflow-x-auto pb-2">{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className={`focus-ring ui-pill min-h-11 shrink-0 !px-4 ${category === item ? "bg-[#1f2e27] text-white" : "border border-[#e2e5df] bg-white text-[#8a6a1e]"}`}>{item === "ALL" ? "همه" : galleryCategoryLabel(item)}</button>)}</div>
    {visible.length ? <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{visible.map((item) => { const image = safeImageUrl(item.imageUrl); return <li key={item.id}><figure className="ui-card overflow-hidden !rounded-[18px]"><div className="relative aspect-[4/5] overflow-hidden bg-[#e3f0e9]"><Image src={image} alt={item.title} fill sizes="(max-width:640px) 48vw, (max-width:1024px) 31vw, 24vw" className="object-cover" unoptimized={isRemoteImage(image)} /></div><figcaption className="p-3"><span className="ui-pill ui-tag-booking">{galleryCategoryLabel(item.category)}</span><strong className="mt-2 block text-sm leading-6">{item.title}</strong><span className="block text-xs text-[#5f7168]">{item.barberName}</span></figcaption></figure></li>; })}</ul> : <div className="mt-5"><EmptyState title="در این دسته نمونه‌ای نیست" description="دسته دیگری را انتخاب کنید." /></div>}
  </div>;
}
