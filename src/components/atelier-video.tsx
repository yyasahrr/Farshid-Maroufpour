"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";

export function AtelierVideo() {
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => { setOpen(true); dialog.current?.showModal(); }} className="focus-ring inline-flex min-h-11 items-center gap-3 rounded-xl px-2 text-white">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#b4c8c9] bg-[#ffffff17]"><Icon name="play" className="h-4 w-4 fill-white" /></span>
      <span className="text-right text-xs font-semibold">تماشای ویدئو<span className="block text-[11px] font-normal text-[#d5dedf]">هنر و تجربه آرایشگری</span></span>
    </button>
    <dialog ref={dialog} aria-labelledby="video-title" onClose={() => { player.current?.pause(); setOpen(false); }} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="auth-dialog w-[min(820px,calc(100vw-24px))] rounded-2xl border border-bone-150 bg-white p-4 text-bone-700 shadow-xl sm:p-6">
      <div className="mb-3 flex items-center justify-between"><h2 id="video-title" className="text-base font-black">تجربهٔ آرایشگری از نزدیک</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="بستن ویدئو" className="focus-ring flex h-11 w-11 items-center justify-center rounded-xl"><Icon name="close" className="h-5 w-5" /></button></div>
      {open && <video ref={player} controls playsInline preload="metadata" poster="/images/video-poster.jpg" className="aspect-video w-full rounded-xl bg-bone-700" aria-label="ویدئوی اجرای اصلاح مو"><source src="/video/barber-desktop.mp4" type="video/mp4" />پخش ویدئو در مرورگر شما پشتیبانی نمی‌شود.</video>}
      <p className="mt-2 text-xs leading-6 text-bone-500">ویدئو: <a className="ui-link" href="https://www.pexels.com/video/a-man-having-a-haircut-4177954/" target="_blank" rel="noreferrer">Pavel Danilyuk / Pexels</a></p>
    </dialog>
  </>;
}
