"use client";

import Image from "next/image";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { deleteMediaAssetAction } from "@/lib/actions/site-content";

export type MediaLibraryItem = {
  id: number;
  url: string;
  originalName: string;
  mediaType: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
};

function readableSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} مگابایت`
    : `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
}

export function MediaLibraryClient({ assets }: { assets: MediaLibraryItem[] }) {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copyError, setCopyError] = useState(false);

  async function copyUrl(asset: MediaLibraryItem) {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      window.setTimeout(() => setCopiedId((current) => current === asset.id ? null : current), 1800);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <div>
      {copyError && <p role="status" className="mb-3 text-sm font-semibold text-rose-700">اجازهٔ کپی در مرورگر داده نشد؛ مسیر فایل را از فیلد محلی آن کپی کنید.</p>}
      {assets.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <li key={asset.id} className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
              <div className="relative aspect-[4/3] bg-bone-700">
                {asset.mediaType === "video" ? (
                  <video src={asset.url} controls preload="metadata" className="h-full w-full object-contain" aria-label={`پیش‌نمایش ${asset.originalName}`} />
                ) : (
                  <Image src={asset.url} alt={`پیش‌نمایش ${asset.originalName}`} fill sizes="(max-width:639px) 90vw, (max-width:1279px) 45vw, 30vw" className="object-cover" unoptimized />
                )}
              </div>
              <div className="p-4">
                <h2 className="truncate text-sm font-black" title={asset.originalName}>{asset.originalName}</h2>
                <p className="mt-1 text-xs text-bone/60">{asset.mediaType === "video" ? "ویدیو" : "تصویر"} · {readableSize(asset.fileSize)} · {new Date(asset.createdAt).toLocaleDateString("fa-IR")}</p>
                <p dir="ltr" className="mt-2 truncate rounded-lg bg-bone-100 px-2 py-1.5 text-left text-[11px] text-bone-600" title={asset.url}>{asset.url}</p>
                <div className="mt-3 flex flex-wrap items-start gap-2">
                  <button type="button" onClick={() => void copyUrl(asset)} className="ops-btn ops-btn-quiet min-h-11" aria-label={`کپی نشانی ${asset.originalName}`}>
                    {copiedId === asset.id ? "نشانی کپی شد ✓" : "کپی نشانی"}
                  </button>
                  <details className="min-w-0 flex-1">
                    <summary className="focus-ring flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-800">حذف امن</summary>
                    <p className="mt-2 text-xs leading-5 text-rose-800">حذف فقط زمانی انجام می‌شود که فایل در هیچ پروفایل، نمونه‌کار یا نسخهٔ CMS استفاده نشده باشد.</p>
                    <ActionForm action={deleteMediaAssetAction} submitLabel="حذف فایل و رکورد" className="mt-2">
                      <input type="hidden" name="mediaId" value={asset.id} />
                    </ActionForm>
                  </details>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ops-empty">هنوز رسانه‌ای به کتابخانه افزوده نشده است.<span className="ops-meta">از «انتخاب از رسانه‌ها / آپلود» کنار هر فیلد محتوا یا پروفایل استفاده کنید.</span></p>
      )}
    </div>
  );
}
