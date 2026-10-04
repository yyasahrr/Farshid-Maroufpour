import Image from "next/image";
import Link from "next/link";
import { formatPersianDate, formatPrice, minutesToLabel } from "@/lib/time";
import { Badge, Stars } from "@/components/ui-cards";
import { Icon } from "@/components/icons";

export type BarberCardData = {
  id: number; slug: string; name: string; title: string; bio: string; experienceYears: number;
  imageUrl: string | null; rating: number | null; reviewCount: number;
  serviceNames: string[]; startPrice: number | null; primaryServiceId: number | null;
  nextSlots: { date: string; startMin: number }[];
};

export function BarberCard({ barber }: { barber: BarberCardData }) {
  const first = barber.nextSlots[0];
  return (
    <article data-reveal="" className="ui-card flex h-full flex-col p-5">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[#e2efe8]">
          {barber.imageUrl ? (
            <Image src={barber.imageUrl} alt={barber.name} fill sizes="64px" className="object-cover" />
          ) : (
            <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-xl font-black text-brand-400">
              <Icon name="user" className="h-7 w-7" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-black">{barber.name}</h2>
          <p className="text-sm text-brass-800">{barber.title}</p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 min-h-[46px] text-sm leading-7 text-bone-500">{barber.bio}</p>

      {barber.serviceNames.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {barber.serviceNames.slice(0, 3).map((name) => (
            <Badge tone="neutral" key={name}>{name}</Badge>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-bone-500">
        <span>{barber.experienceYears.toLocaleString("fa-IR")} سال سابقه</span>
        {barber.rating !== null && (
          <span className="inline-flex items-center gap-1.5">
            <Stars rating={barber.rating} />
            <b className="text-bone-700">{barber.rating.toFixed(1)}</b>
            <span>({barber.reviewCount.toLocaleString("fa-IR")})</span>
          </span>
        )}
      </div>

      <div className="mt-4 border-t border-bone-150 pt-4">
        <p className="text-xs font-semibold text-bone-500">اولین زمان آزاد</p>
        {first ? (
          <p className="mt-1.5 text-sm font-bold text-brand-400">
            {formatPersianDate(first.date)}، ساعت {minutesToLabel(first.startMin)}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-bone-500">این هفته وقتی پیدا نشد؛ روزهای بعد را ببینید.</p>
        )}
        {barber.startPrice !== null && (
          <p className="mt-2 text-xs text-bone-500">شروع از {formatPrice(barber.startPrice)}</p>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-5">
        <Link href={`/barbers/${barber.slug}`} className="ui-button ui-button-quiet flex-1 !text-xs">
          پروفایل
        </Link>
        <Link
          href={first && barber.primaryServiceId
            ? `/booking?service=${barber.primaryServiceId}&barber=${barber.id}&date=${first.date}&time=${first.startMin}`
            : `/booking?barber=${barber.id}`}
          className="ui-button flex-1 !text-xs"
        >
          رزرو <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
