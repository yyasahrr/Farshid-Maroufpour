import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { barberServices, barbers, services } from "@/db/schema";
import { resolveService, nextAvailable } from "@/lib/availability";
import { formatPersianDate, formatPrice, minutesToLabel } from "@/lib/time";
import { serviceImage } from "@/lib/service-media";
import { Badge } from "@/components/ui-cards";

export const dynamic = "force-dynamic";
export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [service] = await db.select().from(services).where(and(eq(services.slug, slug), eq(services.active, true))).limit(1);
  if (!service) notFound();
  const offeredBy = await db.select({ barber: barbers }).from(barberServices)
    .innerJoin(barbers, eq(barbers.id, barberServices.barberId))
    .where(and(eq(barberServices.serviceId, service.id), eq(barbers.active, true)));
  const eligible = (await Promise.all(offeredBy.map(async ({ barber }) => {
    const resolved = await resolveService(barber.id, service.id);
    if (!resolved) return null;
    const next = await nextAvailable(barber.id, service.id);
    return { barber, price: resolved.price, next };
  }))).filter((row): row is NonNullable<typeof row> => Boolean(row));
  return <div className="ui-shell"><div className="ui-container ui-page max-w-[1100px]">
    <nav aria-label="مسیر" className="mb-5 flex items-center gap-2 text-sm text-[#5f7168]"><Link href="/services" className="ui-link">خدمات</Link><span>/</span><span>{service.name}</span></nav>
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center"><div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-[#e2efe8]"><Image src={serviceImage(service.slug)} alt={service.name} fill priority sizes="(max-width:768px) 100vw, 50vw" className="object-cover" /></div><div className="ui-pagehead !mb-0"><Badge tone="brand">{service.category}</Badge><h1 className="mt-3">{service.name}</h1><p>{service.description}</p><dl className="mt-6 grid grid-cols-2 gap-3 text-sm"><div className="ui-card p-4"><dt className="text-[#5f7168]">مدت خدمت</dt><dd className="mt-1 font-bold">{service.durationMin.toLocaleString("fa-IR")} دقیقه</dd></div><div className="ui-card p-4"><dt className="text-[#5f7168]">قیمت پایه</dt><dd className="mt-1 font-bold tabular-nums">{formatPrice(service.basePrice)}</dd></div></dl><Link href={`/booking?service=${service.id}`} className="ui-button mt-6 w-full sm:w-auto">دیدن زمان‌های آزاد</Link></div></div>
    <section className="mt-14"><div className="ui-section-head"><h2>آرایشگران این خدمت</h2></div>{eligible.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{eligible.map(({ barber, price, next }) => <article className="ui-card p-5" key={barber.id}><h3 className="font-bold">{barber.name}</h3><p className="mt-0.5 text-sm text-[#5f7168]">{barber.title}</p><p className="mt-3 text-xs text-[#5f7168]">{next ? `اولین وقت: ${formatPersianDate(next.date)}، ${minutesToLabel(next.startMin)}` : "این هفته زمان آزادی نیست"}</p><p className="mt-2 text-xs font-semibold">{formatPrice(price)}</p><Link href={`/booking?service=${service.id}&barber=${barber.id}`} className="ui-button mt-4 w-full !text-xs">رزرو با {barber.name.split(" ")[0]}</Link></article>)}</div> : <p className="ui-panel text-sm text-[#5f7168]">در حال حاضر آرایشگری برای این خدمت فعال نیست.</p>}</section>
  </div></div>;
}
