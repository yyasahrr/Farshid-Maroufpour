import Image from "next/image";
import Link from "next/link";
import { getServices } from "@/lib/queries";
import { serviceImage } from "@/lib/service-media";
import { formatPrice } from "@/lib/time";
import { EmptyState } from "@/components/ui-cards";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "خدمات سالن", description: "خدمات پیرایش، فید و طراحی ریش؛ مدت و قیمت هر خدمت را ببینید و زمان مناسب را رزرو کنید." };

export default async function ServicesPage() {
  const items = await getServices();
  return <div className="ui-shell"><div className="public-container public-page">
    <div className="ui-pagehead"><h1>خدمات سالن</h1><p>خدمتی را انتخاب کنید که برای شما مناسب است. مدت و مبلغ پیش از رزرو شفاف نمایش داده می‌شوند.</p></div>
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-3">{items.length ? items.map((service) => <article key={service.id} className="ui-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-4"><div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#e2efe8]"><Image src={serviceImage(service.slug)} alt="" fill sizes="80px" className="object-cover" /></div><div className="min-w-0"><p className="mb-1 text-xs font-semibold text-[#2f4a3a]">{service.category}</p><h2 className="text-[17px] font-black">{service.name}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5f7168]">{service.description}</p></div></div><div className="flex items-center justify-between gap-4 border-t border-[#e2e5df] pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0"><div className="text-xs text-[#5f7168]">{service.durationMin.toLocaleString("fa-IR")} دقیقه <span className="mx-1">·</span><b className="text-[#1f2e27]">{formatPrice(service.basePrice)}</b></div><div className="flex items-center gap-2"><Link className="ui-link" href={`/services/${service.slug}`}>جزئیات</Link><Link className="ui-button !min-h-11 !px-4 !text-xs" href={`/booking?services=${service.id}`}>رزرو این خدمت</Link></div></div></article>) : <EmptyState title="خدمتی برای رزرو ثبت نشده است" description="بعداً دوباره سر بزنید یا با پذیرش تماس بگیرید." />}</div>
      <aside className="ui-panel hidden lg:block"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e2efe8] text-[#2f4a3a]"><Icon name="calendar" className="h-5 w-5" /></span><h2 className="mt-4 text-lg font-black">چطور نوبت بگیرم؟</h2><ol className="mt-4 space-y-3 text-sm leading-7 text-[#5f7168]"><li>۱. خدمت‌های مورد نیازتان را انتخاب کنید.</li><li>۲. ترجیح خود را بگویید (زودترین زمان یا آرایشگر خاص).</li><li>۳. تاریخ و یکی از زمان‌های کامل پیشنهادی را تأیید کنید.</li></ol><Link href="/booking" className="ui-button mt-5 w-full !text-xs">شروع رزرو</Link></aside>
    </div>
  </div></div>;
}
