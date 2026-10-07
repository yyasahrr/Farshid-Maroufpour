import Image from "next/image";
import Link from "next/link";
import { formatPersianDate, formatPrice, minutesToLabel } from "@/lib/time";
import { Badge, Stars } from "@/components/ui-cards";
import { Icon } from "@/components/icons";
import { isRemoteImage, safeImageUrl } from "@/lib/service-media";

export type BarberCardData = {
  id: number;
  slug: string;
  name: string;
  title: string;
  bio: string;
  experienceYears: number;
  imageUrl: string | null;
  rating: number | null;
  reviewCount: number;
  serviceNames: string[];
  startPrice: number | null;
  primaryServiceId: number | null;
  nextSlots: { date: string; startMin: number }[];
};

export function BarberCard({ barber }: { barber: BarberCardData }) {
  const first = barber.nextSlots[0];
  const image = barber.imageUrl ? safeImageUrl(barber.imageUrl) : null;

  return (
    <article className="barber-editorial-card flex h-full flex-col">
      <Link
        href={`/barbers/${barber.slug}`}
        aria-label={`پروفایل ${barber.name}`}
        className="group focus-ring block overflow-hidden"
      >
        <div className="barber-card-photo relative aspect-[4/5] overflow-hidden bg-brand-50">
          {image ? (
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 639px) 92vw, (max-width: 1023px) 46vw, 31vw"
              className="barber-card-image object-cover"
              unoptimized={isRemoteImage(image)}
            />
          ) : (
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center text-brand-600"
            >
              <Icon name="user" className="h-12 w-12" weight="strong" />
            </span>
          )}
          <span
            aria-hidden="true"
            className="barber-card-scrim absolute inset-0"
          />
          <span className="absolute inset-x-0 bottom-0 p-4 text-right text-white sm:p-5">
            <span className="inline-block border-b border-brass-400 pb-1 text-xs font-semibold text-brass-200">
              {barber.title}
            </span>
            <span className="mt-2 block text-xl font-black leading-8 sm:text-2xl">
              {barber.name}
            </span>
            {barber.rating !== null && (
              <span className="mt-1 inline-flex items-center gap-2 text-xs text-white/85">
                <Stars rating={barber.rating} />
                <b>{barber.rating.toFixed(1)}</b>
                <span>({barber.reviewCount.toLocaleString("fa-IR")})</span>
              </span>
            )}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col pt-3">
        <p className="text-xs font-semibold text-bone-500">
          {barber.experienceYears.toLocaleString("fa-IR")} سال سابقه
        </p>
        {barber.bio && (
          <p className="mt-2 line-clamp-3 text-sm leading-7 text-bone-500">
            {barber.bio}
          </p>
        )}

        {barber.serviceNames.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {barber.serviceNames.slice(0, 3).map((name) => (
              <Badge tone="neutral" key={name}>
                {name}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-auto border-t border-bone-150 pt-3">
          <div className="flex items-start justify-between gap-3 text-xs text-bone-500">
            <div>
              <span className="font-semibold">اولین زمان آزاد</span>
              {first ? (
                <p className="mt-1 text-sm font-bold text-brand-400">
                  {formatPersianDate(first.date)}، ساعت{" "}
                  {minutesToLabel(first.startMin)}
                </p>
              ) : (
                <p className="mt-1 text-sm leading-6">
                  این هفته وقتی پیدا نشد؛ روزهای بعد را ببینید.
                </p>
              )}
            </div>
            {barber.startPrice !== null && (
              <span className="shrink-0 text-left">
                <span className="block text-[11px]">شروع از</span>
                <b className="mt-1 block text-sm text-bone-700">
                  {formatPrice(barber.startPrice)}
                </b>
              </span>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Link
              href={`/barbers/${barber.slug}`}
              className="focus-ring ui-button ui-button-quiet min-h-11 flex-1 !text-xs"
            >
              پروفایل
            </Link>
            <Link
              href={
                first && barber.primaryServiceId
                  ? `/booking?services=${barber.primaryServiceId}&barber=${barber.id}&pref=PREFERRED_BARBER&date=${first.date}&time=${first.startMin}`
                  : `/booking?barber=${barber.id}`
              }
              className="focus-ring ui-button min-h-11 flex-1 !text-xs"
            >
              رزرو <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
