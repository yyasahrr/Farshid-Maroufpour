"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui-cards";
import { galleryCategoryLabel, type GalleryItem } from "@/lib/gallery";
import { isRemoteImage, safeImageUrl } from "@/lib/service-media";

export function Gallery({ items }: { items: GalleryItem[] }) {
  const [category, setCategory] = useState("ALL");
  const categories = useMemo(
    () => ["ALL", ...new Set(items.map((item) => item.category))],
    [items],
  );
  const visible =
    category === "ALL"
      ? items
      : items.filter((item) => item.category === category);

  if (!items.length) {
    return (
      <EmptyState
        title="هنوز نمونه‌ای ثبت نشده است"
        description="بعداً دوباره به این صفحه سر بزنید."
      />
    );
  }

  return (
    <div>
      <div
        role="group"
        aria-label="دسته‌بندی نمونه‌ها"
        className="hide-scrollbar flex gap-2 overflow-x-auto pb-2"
      >
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            aria-pressed={category === item}
            className={`focus-ring ui-pill min-h-11 shrink-0 !px-4 ${
              category === item
                ? "bg-bone-700 text-white"
                : "border border-bone-150 bg-white text-brass-800"
            }`}
          >
            {item === "ALL" ? "همه" : galleryCategoryLabel(item)}
          </button>
        ))}
      </div>

      {visible.length ? (
        <ul className="gallery-editorial-grid mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-4 lg:gap-y-7">
          {visible.map((item) => {
            const image = safeImageUrl(item.imageUrl);
            return (
              <li
                key={item.id}
                className="gallery-editorial-item group min-w-0"
              >
                <figure className="relative aspect-[4/5] overflow-hidden bg-brand-900">
                  <Image
                    src={image}
                    alt={`${item.title} — ${galleryCategoryLabel(item.category)}, ${item.barberName}`}
                    fill
                    sizes="(max-width: 639px) 48vw, (max-width: 1023px) 31vw, 24vw"
                    className="gallery-editorial-image no-outline object-cover"
                    unoptimized={isRemoteImage(image)}
                  />
                  <span
                    aria-hidden="true"
                    className="gallery-editorial-scrim absolute inset-0"
                  />
                  <figcaption className="absolute inset-x-0 bottom-0 p-3 text-right text-white sm:p-4">
                    <span className="block text-xs font-bold text-brass-200">
                      {galleryCategoryLabel(item.category)}
                    </span>
                    <strong className="mt-1 block text-sm leading-6 text-balance sm:text-base">
                      {item.title}
                    </strong>
                    <span className="mt-1 block text-xs text-white/75">
                      {item.barberName}
                    </span>
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-5">
          <EmptyState
            title="در این دسته نمونه‌ای نیست"
            description="دسته دیگری را انتخاب کنید."
          />
        </div>
      )}
    </div>
  );
}
