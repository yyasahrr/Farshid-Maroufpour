"use client";

import { useRef, useState } from "react";

/**
 * Picks a local file, uploads it to /api/admin/upload and writes the returned
 * public URL into the sibling URL field (id passed in). The field stays a
 * plain input so editors can also paste an external URL.
 */
export function UploadButton({ targetId, accept = "video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/avif", label = "آپلود فایل" }: { targetId: string; accept?: string; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

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
      const target = document.getElementById(targetId) as HTMLInputElement | null;
      if (!target) throw new Error("فیلد مقصد یافت نشد.");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(target, data.url);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      setStatus("فایل آپلود شد و در فرم قرار گرفت ✓");
    } catch (err) {
      setStatus(err instanceof Error ? `⚠ ${err.message}` : "⚠ آپلود انجام نشد.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        id={`${targetId}-upload`}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="focus-ring rounded-full border border-[#0f5a3b]/40 bg-white px-3 py-1.5 text-[11px] font-bold text-[#0f5a3b] transition hover:bg-[#e3f0e9] disabled:opacity-50"
      >
        {busy ? "در حال آپلود…" : label}
      </button>
      {status && (
        <span role="status" className={`text-[11px] font-bold ${status.startsWith("⚠") ? "text-rose-700" : "text-[#0f5a3b]"}`}>
          {status}
        </span>
      )}
    </span>
  );
}
