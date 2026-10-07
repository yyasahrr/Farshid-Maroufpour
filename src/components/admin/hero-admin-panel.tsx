import Image from "next/image";
import { ActionForm } from "@/components/action-form";
import { UploadButton } from "@/components/admin/upload-button";
import { saveHeroSettingsAction } from "@/lib/actions/site-content";
import { getHeroSettings } from "@/lib/hero-settings";

const inputClass = "ops-field mt-1 w-full";

export async function HeroAdminPanel() {
  const settings = await getHeroSettings();
  const accept = "image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime";
  return (
    <ActionForm action={saveHeroSettingsAction} submitLabel="ذخیرهٔ هدر صفحهٔ اصلی" className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="hero-headline" className="ops-label">تیتر اصلی</label><input id="hero-headline" name="headline" defaultValue={settings.headline} maxLength={100} required className={inputClass} /></div>
        <div><label htmlFor="hero-subtitle" className="ops-label">زیرتیتر</label><textarea id="hero-subtitle" name="subtitle" defaultValue={settings.subtitle} maxLength={220} rows={2} className={inputClass} /></div>
        <div><label htmlFor="hero-primary" className="ops-label">متن دکمهٔ اصلی</label><input id="hero-primary" name="primaryCtaLabel" defaultValue={settings.primaryCtaLabel} maxLength={36} required className={inputClass} /></div>
        <div><label htmlFor="hero-secondary" className="ops-label">متن دکمهٔ دوم</label><input id="hero-secondary" name="secondaryCtaLabel" defaultValue={settings.secondaryCtaLabel} maxLength={36} required className={inputClass} /></div>
        <div>
          <label htmlFor="hero-media-type" className="ops-label">نوع رسانهٔ هدر</label>
          <select id="hero-media-type" name="mediaType" defaultValue={settings.mediaType} className={inputClass}><option value="video">ویدیو</option><option value="image">تصویر</option></select>
          <p className="mt-1 text-[11px] text-bone/55">پس از انتخاب نوع، فایل سازگار را برای هر اندازه بارگذاری کنید.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {([
          { id: "hero-desktop-media", label: "رسانهٔ دسکتاپ" },
          { id: "hero-mobile-media", label: "رسانهٔ موبایل" },
        ] as const).map(({ id, label }) => {
          const value = id === "hero-desktop-media" ? settings.desktopMediaUrl : settings.mobileMediaUrl;
          return (
            <section key={id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <h3 className="text-sm font-black">{label}</h3>
              <div className="relative mt-3 aspect-[16/8] overflow-hidden rounded-xl bg-bone-700">
                {settings.mediaType === "video" ? <video src={value} muted controls playsInline preload="metadata" className="h-full w-full object-cover" aria-label={`پیش‌نمایش ${label}`} /> : <Image src={value} alt={`پیش‌نمایش ${label}`} fill sizes="(max-width:1024px) 90vw, 40vw" className="object-cover" unoptimized={value.startsWith("http")} />}
              </div>
              <label htmlFor={id} className="ops-label mt-3 block">مسیر رسانه</label>
              <input id={id} name={id === "hero-desktop-media" ? "desktopMediaUrl" : "mobileMediaUrl"} dir="ltr" defaultValue={value} className={inputClass} />
              <div className="mt-2"><UploadButton targetId={id} accept={accept} label="جایگزینی رسانه" /></div>
              <p className="mt-2 text-[11px] leading-5 text-bone/55">فایل اصلی به پوشهٔ رسانهٔ سایت افزوده می‌شود؛ مسیر فایل‌سیستم به کاربر نشان داده نمی‌شود.</p>
            </section>
          );
        })}
      </div>
    </ActionForm>
  );
}
