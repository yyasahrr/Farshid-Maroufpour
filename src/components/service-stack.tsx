import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { formatPrice } from "@/lib/time";

export type ServiceStackItem = {
  index: string;
  name: string;
  tagline: string;
  description: string;
  durationMin: number;
  price: number;
  imageUrl: string;
  href: string;
};

/**
 * Scroll sticky stack in White, Emerald Green & Champagne Gold:
 * - Crisp white cards with gold hairline accents
 * - Deep emerald badges and gold numbering
 * - Pinned smooth scroll behavior on desktop & mobile
 */
export function ServiceStack({ items }: { items: ServiceStackItem[] }) {
  return (
    <div className="space-y-6">
      {items.map((item, i) => (
        <div
          key={item.name}
          className="sticky"
          style={{ top: `${92 + i * 20}px`, zIndex: i + 1 }}
        >
          <Reveal>
            <article className="glass-card overflow-hidden rounded-[2rem] border-2 border-[#c59b4b]/35 shadow-[0_25px_50px_-25px_rgba(15,90,59,0.2)]">
              <div className="grid md:grid-cols-2">
                <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[26rem]">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0e1e16]/80 via-transparent to-transparent md:bg-gradient-to-l md:from-transparent md:to-[#0e1e16]/60" />
                  <span className="absolute top-5 right-5 text-6xl font-black text-white/30 md:left-6 md:right-auto">
                    {item.index}
                  </span>
                  <div className="absolute bottom-5 right-5 md:hidden">
                    <span className="rounded-full bg-[#0f5a3b] px-3.5 py-1 text-xs font-bold text-white shadow">
                      {item.tagline}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col justify-center bg-gradient-to-br from-white via-white/95 to-[#f7f4ec] p-7 md:p-11">
                  <div className="hidden md:flex items-center gap-2">
                    <span className="h-1.5 w-6 rounded-full bg-[#c59b4b]" />
                    <p className="text-xs font-bold tracking-[0.35em] text-[#0f5a3b]">
                      {item.tagline}
                    </p>
                  </div>
                  <h3 className="mt-3 text-3xl font-black text-bone md:text-4xl">{item.name}</h3>
                  <p className="mt-4 max-w-md text-sm leading-8 text-bone/70">{item.description}</p>
                  <dl className="mt-6 flex gap-8 border-y border-[#c59b4b]/20 py-4 text-sm">
                    <div>
                      <dt className="text-[11px] font-semibold text-bone/50">مدت زمان</dt>
                      <dd className="mt-1 font-bold text-[#0f5a3b]">{item.durationMin} دقیقه</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-bone/50">تعرفه پایه</dt>
                      <dd className="mt-1 font-black text-[#855e16]">{formatPrice(item.price)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-bone/50">سطح اجرا</dt>
                      <dd className="mt-1 font-bold text-bone">Master Atelier</dd>
                    </div>
                  </dl>
                  <div className="mt-7 flex items-center gap-4">
                    <Link
                      href={item.href}
                      className="focus-ring rounded-full bg-[#0f5a3b] px-8 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#094028] hover:shadow-[0_10px_24px_-4px_rgba(197,155,75,0.6)]"
                    >
                      رزرو این سرویس
                    </Link>
                    <span className="text-xs text-bone/50">تضمین کیفیت و مشاوره فرم چهره</span>
                  </div>
                </div>
              </div>
            </article>
          </Reveal>
        </div>
      ))}
    </div>
  );
}
