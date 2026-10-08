import Image from "next/image";
import { ActionForm } from "@/components/action-form";
import { UploadButton } from "@/components/admin/upload-button";
import { saveHomeContentDraftAction } from "@/lib/actions/site-content";
import type { HomeSiteContent } from "@/lib/site-content-contract";

const inputClass = "ops-field mt-1 w-full";
const fields = [
  { key: "about", label: "دربارهٔ ما", bodyMax: 600 },
  { key: "team", label: "معرفی تیم", bodyMax: 300 },
  { key: "portfolio", label: "نمونه‌کارها", bodyMax: 300 },
  { key: "academy", label: "آکادمی", bodyMax: 300 },
  { key: "booking", label: "تماس و راهنمایی رزرو", bodyMax: 300 },
] as const;

export function SiteContentEditor({ content }: { content: HomeSiteContent }) {
  const accept = "image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime";
  const media = [
    { id: "home-desktop-media", name: "hero.desktopMediaUrl", label: "رسانهٔ دسکتاپ", value: content.hero.desktopMediaUrl },
    { id: "home-mobile-media", name: "hero.mobileMediaUrl", label: "رسانهٔ موبایل", value: content.hero.mobileMediaUrl },
  ];

  return (
    <ActionForm action={saveHomeContentDraftAction} submitLabel="ذخیرهٔ پیش‌نویس" className="space-y-7">
      <section aria-labelledby="cms-hero-title" className="space-y-4">
        <div>
          <h3 id="cms-hero-title" className="text-base font-black">هدر صفحهٔ اصلی</h3>
          <p className="mt-1 text-xs leading-6 text-bone/60">رسانه و نوشته‌ها تا زمان انتشار فقط در پیش‌نویس و پیش‌نمایش خصوصی می‌مانند.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="cms-hero-headline" className="ops-label">تیتر اصلی</label><input id="cms-hero-headline" name="hero.headline" defaultValue={content.hero.headline} maxLength={100} minLength={2} required className={inputClass} /></div>
          <div><label htmlFor="cms-hero-subtitle" className="ops-label">زیرتیتر</label><textarea id="cms-hero-subtitle" name="hero.subtitle" defaultValue={content.hero.subtitle} maxLength={220} rows={2} className={inputClass} /></div>
          <div><label htmlFor="cms-hero-primary" className="ops-label">متن دکمهٔ اصلی</label><input id="cms-hero-primary" name="hero.primaryCtaLabel" defaultValue={content.hero.primaryCtaLabel} maxLength={36} required className={inputClass} /></div>
          <div><label htmlFor="cms-hero-secondary" className="ops-label">متن دکمهٔ دوم</label><input id="cms-hero-secondary" name="hero.secondaryCtaLabel" defaultValue={content.hero.secondaryCtaLabel} maxLength={36} required className={inputClass} /></div>
          <div>
            <label htmlFor="cms-hero-media-type" className="ops-label">نوع رسانهٔ هدر</label>
            <select id="cms-hero-media-type" name="hero.mediaType" defaultValue={content.hero.mediaType} className={inputClass}>
              <option value="video">ویدیو</option><option value="image">تصویر</option>
            </select>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {media.map((item) => (
            <section key={item.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <h4 className="text-sm font-black">{item.label}</h4>
              <div className="relative mt-3 aspect-[16/8] overflow-hidden rounded-xl bg-bone-700">
                {content.hero.mediaType === "video" ? (
                  <video src={item.value} muted controls playsInline preload="metadata" className="h-full w-full object-cover" aria-label={`پیش‌نمایش ${item.label}`} />
                ) : (
                  <Image src={item.value} alt={`پیش‌نمایش ${item.label}`} fill sizes="(max-width:1024px) 90vw, 40vw" className="object-cover" unoptimized={item.value.startsWith("http")} />
                )}
              </div>
              <label htmlFor={item.id} className="ops-label mt-3 block">مسیر رسانه</label>
              <input id={item.id} name={item.name} dir="ltr" defaultValue={item.value} maxLength={500} required className={inputClass} />
              <div className="mt-2"><UploadButton targetId={item.id} accept={accept} label="انتخاب از رسانه‌ها / آپلود" /></div>
            </section>
          ))}
        </div>
      </section>

      <div className="border-t border-[var(--color-border)] pt-6">
        <h3 className="text-base font-black">متن بخش‌های صفحهٔ اصلی</h3>
        <p className="mt-1 text-xs leading-6 text-bone/60">اطلاعات خدمات، تیم، نمونه‌کار، کلاس و راه‌های تماس همچنان از رکوردهای سامانه خوانده می‌شوند؛ اینجا فقط متن معرفی و تیترها ویرایش می‌شوند.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {fields.map(({ key, label, bodyMax }) => {
            const section = content[key];
            return (
              <fieldset key={key} className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <legend className="px-1 text-sm font-black">{label}</legend>
                <label htmlFor={`cms-${key}-heading`} className="ops-label">تیتر</label>
                <input id={`cms-${key}-heading`} name={`${key}.heading`} defaultValue={section.heading} maxLength={key === "academy" || key === "booking" ? 100 : 80} minLength={2} required className={inputClass} />
                <label htmlFor={`cms-${key}-body`} className="ops-label mt-3 block">متن</label>
                <textarea id={`cms-${key}-body`} name={`${key}.body`} defaultValue={section.body} maxLength={bodyMax} rows={3} minLength={2} required className={inputClass} />
              </fieldset>
            );
          })}
        </div>
      </div>
    </ActionForm>
  );
}
