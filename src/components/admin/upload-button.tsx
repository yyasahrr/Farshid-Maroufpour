"use client";

import Image from "next/image";
import { useRef, useState } from "react";

type LibraryAsset = {
  id: number;
  url: string;
  originalName: string;
  mediaType: "image" | "video";
  mimeType: string;
  fileSize: number;
};

/** Uploads a validated asset or selects an existing asset into the adjacent URL field. */
export function UploadButton({
  targetId,
  accept = "video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/avif",
  label = "آپلود فایل",
}: {
  targetId: string;
  accept?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);

  function setTargetUrl(url: string) {
    const target = document.getElementById(targetId) as HTMLInputElement | null;
    if (!target) throw new Error("فیلد مقصد یافت نشد.");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(target, url);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setStatus("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data: { url?: string; error?: string } = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error ?? "آپلود انجام نشد.");
      setTargetUrl(data.url);
      setStatus("رسانه در کتابخانه ذخیره و به فرم افزوده شد ✓");
      setAssets((current) => [
        {
          id: Date.now(),
          url: data.url!,
          originalName: file.name,
          mediaType: file.type.startsWith("video/") ? "video" : "image",
          mimeType: file.type,
          fileSize: file.size,
        },
        ...current,
      ]);
    } catch (err) {
      setStatus(err instanceof Error ? `⚠ ${err.message}` : "⚠ آپلود انجام نشد.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function openLibrary() {
    setStatus("");
    setLibraryLoading(true);
    dialogRef.current?.showModal();
    try {
      const response = await fetch("/api/admin/media", { cache: "no-store" });
      const data: { assets?: LibraryAsset[]; error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "کتابخانه در دسترس نیست.");
      setAssets(data.assets ?? []);
    } catch (err) {
      setStatus(err instanceof Error ? `⚠ ${err.message}` : "⚠ کتابخانه در دسترس نیست.");
      dialogRef.current?.close();
    } finally {
      setLibraryLoading(false);
    }
  }

  function chooseAsset(asset: LibraryAsset) {
    try {
      setTargetUrl(asset.url);
      setStatus("رسانهٔ موجود از کتابخانه انتخاب شد ✓");
      dialogRef.current?.close();
    } catch (err) {
      setStatus(err instanceof Error ? `⚠ ${err.message}` : "⚠ انتخاب رسانه انجام نشد.");
    }
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        id={`${targetId}-upload`}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="focus-ring rounded-full border border-[#0f5a3b]/40 bg-white px-3 py-2 text-[11px] font-bold text-[#0f5a3b] transition hover:bg-[#e3f0e9] disabled:opacity-50"
      >
        {busy ? "در حال آپلود…" : label}
      </button>
      <button
        type="button"
        onClick={() => void openLibrary()}
        className="focus-ring rounded-full border border-[#c59b4b]/45 bg-white px-3 py-2 text-[11px] font-bold text-bone-700 transition hover:bg-[#f7f0d8]"
      >
        انتخاب از کتابخانه
      </button>
      {status && (
        <span role="status" className={`text-[11px] font-bold ${status.startsWith("⚠") ? "text-rose-700" : "text-[#0f5a3b]"}`}>
          {status}
        </span>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${targetId}-library-title`}
        className="m-auto max-h-[85svh] w-[min(680px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-[#d8dfd9] bg-[#fdfcf9] p-0 text-[#1f2e27] shadow-2xl backdrop:bg-[#07170f]/55"
        onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#e2e5df] px-4 py-3">
          <div>
            <h2 id={`${targetId}-library-title`} className="text-base font-black">انتخاب رسانهٔ موجود</h2>
            <p className="mt-1 text-xs text-bone-500">فایل برای همین فیلد انتخاب می‌شود؛ چیزی منتشر نخواهد شد.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} className="focus-ring min-h-11 rounded-lg px-3 text-sm font-bold">بستن</button>
        </div>
        <div className="max-h-[calc(85svh-72px)] overflow-y-auto p-4">
          {libraryLoading ? (
            <p role="status" className="py-10 text-center text-sm">در حال بارگذاری کتابخانه…</p>
          ) : assets.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {assets.map((asset) => (
                <li key={`${asset.id}-${asset.url}`}>
                  <button type="button" onClick={() => chooseAsset(asset)} className="focus-ring flex min-h-20 w-full items-center gap-3 rounded-xl border border-[#e2e5df] bg-white p-2 text-right hover:border-[#0f5a3b]/45">
                    <span className="relative block h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-bone-700">
                      {asset.mediaType === "image" ? (
                        <Image src={asset.url} alt="" fill sizes="80px" className="object-cover" unoptimized />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center text-xs font-black text-white">ویدیو</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold">{asset.originalName}</span>
                      <span dir="ltr" className="mt-1 block truncate text-left text-[10px] text-bone-500">{asset.url}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ops-empty">کتابخانه خالی است؛ یک فایل تصویری یا ویدیویی بارگذاری کنید.</p>
          )}
        </div>
      </dialog>
    </div>
  );
}
