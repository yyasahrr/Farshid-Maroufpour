"use client";

import Image from "next/image";
import { useState } from "react";
import { galleryCategoryLabel, type GalleryItem } from "@/lib/gallery";
import { isRemoteImage, safeImageUrl } from "@/lib/service-media";

export function HomePortfolioCurtain({ items }: { items: GalleryItem[] }) {
  const [activeId, setActiveId] = useState<number | null>(items[0]?.id ?? null);

  if (items.length === 0) return null;

  return (
    <div
      aria-label="نمونه‌کارها؛ برای باز شدن قاب انتخاب کنید"
      className="home-portfolio-curtain mt-8 flex gap-2"
      dir="rtl"
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        const image = safeImageUrl(item.imageUrl);
        const panelId = `portfolio-panel-${item.id}`;

        return (
          <button
            key={item.id}
            id={`portfolio-trigger-${item.id}`}
            type="button"
            aria-expanded={isActive}
            aria-controls={panelId}
            aria-label={`${isActive ? "بستن" : "باز کردن"} نمونه‌کار ${item.title}؛ ${galleryCategoryLabel(item.category)}، ${item.barberName}`}
            onClick={() => setActiveId(isActive ? null : item.id)}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setActiveId(item.id);
            }}
            onFocus={() => setActiveId(item.id)}
            className="home-portfolio-panel focus-ring relative min-h-[360px] min-w-0 overflow-hidden rounded-[22px] bg-brand-900 text-right text-white sm:min-h-[420px]"
            data-active={isActive}
          >
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 639px) 72vw, (max-width: 1023px) 24vw, 58vw"
              className="home-portfolio-image object-cover"
              unoptimized={isRemoteImage(image)}
            />
            <span aria-hidden="true" className="home-portfolio-scrim absolute inset-0" />
            <span className="home-portfolio-closed-label absolute inset-x-2 bottom-4 z-10 text-center text-xs font-bold leading-5">
              {galleryCategoryLabel(item.category)}
            </span>
            <span
              id={panelId}
              className="home-portfolio-caption absolute inset-x-0 bottom-0 z-10 p-4 text-right sm:p-6"
              aria-hidden={!isActive}
            >
              <span className="block text-sm font-bold text-[#d8eadf]">
                {galleryCategoryLabel(item.category)}
              </span>
              <span className="mt-1 block text-xl font-black leading-snug text-balance sm:text-2xl">
                {item.title}
              </span>
              <span className="mt-1 block text-sm text-white/85">{item.barberName}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
