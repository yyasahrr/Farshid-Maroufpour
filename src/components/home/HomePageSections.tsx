import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import type { getServices, getHomeBarbers } from "@/lib/queries";
import type { GalleryItem } from "@/lib/gallery";
import { galleryCategoryLabel } from "@/lib/gallery";
import { CONTACT_PHONE_TEL } from "@/lib/site";
import { isRemoteImage, safeImageUrl } from "@/lib/service-media";
import { formatPrice } from "@/lib/time";

type HomeService = Awaited<ReturnType<typeof getServices>>[number];
type HomeBarber = Awaited<ReturnType<typeof getHomeBarbers>>[number];

function BarberPortrait({
  barber,
  className = "",
  sizes = "(max-width: 639px) 44vw, (max-width: 1023px) 42vw, 28vw",
}: {
  barber: HomeBarber;
  className?: string;
  sizes?: string;
}) {
  const image = barber.imageUrl ? safeImageUrl(barber.imageUrl) : null;

  return (
    <div
      className={`home-team-photo relative isolate w-full overflow-hidden bg-brand-100 ${className}`}
    >
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          sizes={sizes}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
          unoptimized={isRemoteImage(image)}
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-brand-700/50"
        >
          <Icon name="user" className="h-14 w-14" weight="strong" />
        </span>
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-950/35 via-transparent to-transparent"
      />
    </div>
  );
}

function BarberSkills({ skills }: { skills: string[] }) {
  if (skills.length === 0) return null;

  return (
    <ul aria-label="تخصص‌ها" className="mt-4 flex flex-wrap gap-2">
      {skills.map((skill) => (
        <li
          key={skill}
          className="rounded-full border border-brand-900/10 bg-white/65 px-3 py-1 text-xs font-semibold text-bone-600"
        >
          {skill}
        </li>
      ))}
    </ul>
  );
}

function serviceIcon(slug: string): IconName {
  switch (slug) {
    case "beard":
      return "star";
    case "combo":
      return "users";
    case "color":
      return "diamond";
    default:
      return "scissors";
  }
}

export function WhyChooseUs() {
  const reasons = [
    {
      icon: "calendar" as const,
      title: "زمان آزاد را خودت ببین",
      description: "روز و ساعت‌های قابل رزرو را پیش از ثبت نوبت بررسی کن.",
    },
    {
      icon: "users" as const,
      title: "آرایشگر مناسب را انتخاب کن",
      description: "پروفایل و تخصص هر آرایشگر را ببین و بعد تصمیم بگیر.",
    },
    {
      icon: "clock" as const,
      title: "هزینه و مدت روشن است",
      description:
        "قیمت و زمان هر خدمت پیش از رفتن به مرحله رزرو نمایش داده می‌شود.",
    },
  ];

  return (
    <section
      id="about"
      className="home-page-section scroll-mt-24 bg-[#eeefe9] py-14 sm:py-16"
    >
      <div className="public-container">
        <div data-reveal="" className="max-w-2xl">
          <h2 className="text-3xl leading-[1.3] font-black text-bone-700 text-balance sm:text-4xl">
            دربارهٔ ما
          </h2>
          <p className="mt-3 max-w-xl text-base leading-8 text-bone-500">
            فرشید معروف پور، سالن پیرایش مردانه و آکادمی آموزش تخصصی را کنار هم
            گرد آورده است. خدمات، تخصص آرایشگران و دوره‌های آکادمی را بررسی کن و
            بعد مسیر مناسب خودت را انتخاب کن.
          </p>
        </div>
        <ol className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map((reason) => (
            <li key={reason.title} data-reveal="" className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700">
                <Icon name={reason.icon} className="h-5 w-5" weight="strong" />
              </span>
              <div>
                <h3 className="text-base font-bold text-bone-700">
                  {reason.title}
                </h3>
                <p className="mt-1 text-sm leading-7 text-bone-500">
                  {reason.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function HomeServices({ services }: { services: HomeService[] }) {
  return (
    <section
      id="services"
      className="home-page-section scroll-mt-24 bg-bone-100 py-14 sm:py-16"
    >
      <div className="public-container">
        <div
          data-reveal=""
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div className="max-w-2xl">
            <h2 className="text-3xl leading-[1.3] font-black text-bone-700 text-balance sm:text-4xl">
              خدمات سالن
            </h2>
            <p className="mt-3 max-w-xl text-base leading-8 text-bone-500">
              خدمت دلخواهت را انتخاب کن؛ جزئیات و زمان‌های رزرو در دسترس است.
            </p>
          </div>
          <Link
            href="/services"
            className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-700 hover:bg-white/70"
          >
            همهٔ خدمات <Icon name="arrow" className="h-4 w-4" weight="strong" />
          </Link>
        </div>

        {services.length > 0 ? (
          <ul className="home-services-grid mt-7 grid gap-x-8 sm:grid-cols-2">
            {services.map((service, index) => (
              <li
                key={service.id}
                data-reveal=""
                className="border-t border-bone-150"
              >
                <Link
                  href={`/services/${service.slug}`}
                  className="home-service-row focus-ring group flex min-h-[92px] items-center gap-3 py-4 sm:gap-4"
                >
                  <span
                    aria-hidden="true"
                    className="hidden w-7 shrink-0 text-xs font-semibold tabular-nums text-brass-600 sm:block"
                  >
                    {(index + 1).toLocaleString("fa-IR", {
                      minimumIntegerDigits: 2,
                    })}
                  </span>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 sm:h-11 sm:w-11">
                    <Icon
                      name={serviceIcon(service.slug)}
                      className="h-5 w-5"
                      weight="strong"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-black text-bone-700">
                      {service.name}
                    </span>
                    <span className="mt-1 block line-clamp-1 text-xs leading-5 text-bone-500 sm:text-sm">
                      {service.description}
                    </span>
                  </span>
                  <span className="shrink-0 text-left">
                    <span className="block text-sm font-bold text-bone-700">
                      {formatPrice(service.basePrice)}
                    </span>
                    <span className="mt-1 block text-[11px] text-bone-500">
                      {service.durationMin.toLocaleString("fa-IR")} دقیقه
                    </span>
                  </span>
                  <Icon
                    name="arrow"
                    className="h-4 w-4 shrink-0 text-brass-600"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p
            data-reveal=""
            className="mt-7 border-y border-bone-150 py-6 text-sm leading-7 text-bone-500"
          >
            در حال حاضر خدمتی برای رزرو ثبت نشده است. برای راهنمایی با پذیرش
            تماس بگیر.
          </p>
        )}
      </div>
    </section>
  );
}

export function HomeTeam({ barbers }: { barbers: HomeBarber[] }) {
  const founder = barbers.find((barber) => barber.title.includes("بنیان‌گذار"));
  const teamMembers = founder
    ? barbers.filter((barber) => barber.id !== founder.id)
    : barbers;

  return (
    <section
      id="team"
      className="home-page-section scroll-mt-24 bg-[#eeefe9] py-14 sm:py-16"
    >
      <div className="public-container">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div data-reveal="" className="max-w-2xl">
            <h2 className="text-3xl leading-[1.3] font-black text-bone-700 text-balance sm:text-4xl">
              با تیم ما آشنا شو
            </h2>
            <p className="mt-3 max-w-xl text-base leading-8 text-bone-500">
              تخصص هر آرایشگر را ببین و کسی را انتخاب کن که با خواسته‌ات هماهنگ
              است.
            </p>
          </div>
          <Link
            href="/barbers"
            className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-700 hover:bg-brand-50"
          >
            دیدن همهٔ آرایشگران{" "}
            <Icon name="arrow" className="h-4 w-4" weight="strong" />
          </Link>
        </div>

        {founder && (
          <article
            data-reveal=""
            className="mt-8 grid overflow-hidden bg-brand-50 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
          >
            <Link
              href={`/barbers/${founder.slug}`}
              aria-label={`پروفایل ${founder.name}`}
              className="group focus-ring block overflow-hidden"
            >
              <BarberPortrait
                barber={founder}
                sizes="(max-width: 1023px) 100vw, 42vw"
                className="aspect-[4/3] lg:h-full lg:aspect-auto"
              />
            </Link>
            <div className="flex min-w-0 flex-col justify-center p-5 sm:p-8 lg:p-10">
              <p className="text-sm font-bold text-brass-700">
                {founder.title}
              </p>
              <h3 className="mt-2 text-2xl font-black text-bone-700 sm:text-3xl">
                {founder.name}
              </h3>
              {founder.bio && (
                <p className="mt-3 max-w-2xl text-sm leading-7 text-bone-600">
                  {founder.bio}
                </p>
              )}
              <BarberSkills skills={founder.serviceNames} />
              <Link
                href={`/barbers/${founder.slug}`}
                className="ui-button mt-5 min-h-11 self-start !px-5"
              >
                دیدن پروفایل
              </Link>
            </div>
          </article>
        )}

        {barbers.length > 0 ? (
          <div className="mt-9">
            {teamMembers.length > 0 && (
              <h3 data-reveal="" className="text-lg font-black text-bone-700">
                آرایشگران تیم
              </h3>
            )}
            {teamMembers.length > 0 ? (
              <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 lg:grid-cols-3">
                {teamMembers.map((barber) => (
                  <li key={barber.id} data-reveal="" className="min-w-0">
                    <article className="home-team-card h-full">
                      <Link
                        href={`/barbers/${barber.slug}`}
                        aria-label={`پروفایل ${barber.name}`}
                        className="group focus-ring block overflow-hidden"
                      >
                        <BarberPortrait barber={barber} />
                      </Link>
                      <div className="pt-3">
                        <p className="text-xs font-semibold text-brass-700">
                          {barber.title}
                        </p>
                        <h4 className="mt-1 text-base font-black text-bone-700 sm:text-lg">
                          <Link
                            href={`/barbers/${barber.slug}`}
                            className="focus-ring rounded-sm"
                          >
                            {barber.name}
                          </Link>
                        </h4>
                        {barber.bio && (
                          <p className="mt-2 line-clamp-3 text-xs leading-6 text-bone-500 sm:text-sm">
                            {barber.bio}
                          </p>
                        )}
                        <BarberSkills skills={barber.serviceNames} />
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            ) : founder ? (
              <p className="mt-3 text-sm leading-7 text-bone-500">
                در حال حاضر آرایشگر دیگری برای معرفی در این بخش ثبت نشده است.
              </p>
            ) : null}
          </div>
        ) : (
          <p
            data-reveal=""
            className="mt-8 border-y border-bone-150 py-6 text-sm leading-7 text-bone-500"
          >
            فهرست آرایشگران در حال تکمیل است. برای انتخاب متخصص با پذیرش تماس
            بگیر.
          </p>
        )}
      </div>
    </section>
  );
}

export function HomePortfolio({ items }: { items: GalleryItem[] }) {
  return (
    <section
      id="work"
      className="home-page-section scroll-mt-24 bg-bone-100 py-14 sm:py-16"
    >
      <div className="public-container">
        <div
          data-reveal=""
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div className="max-w-2xl">
            <h2 className="text-3xl leading-[1.3] font-black text-bone-700 text-balance sm:text-4xl">
              نمونه‌کارهای تیم
            </h2>
            <p className="mt-3 max-w-xl text-base leading-8 text-bone-500">
              سبک‌های ثبت‌شده توسط آرایشگران را ببین و برای آشنایی با هر متخصص،
              پروفایلش را باز کن.
            </p>
          </div>
          <Link
            href="/work"
            className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-700 hover:bg-white/70"
          >
            همهٔ نمونه‌کارها{" "}
            <Icon name="arrow" className="h-4 w-4" weight="strong" />
          </Link>
        </div>

        {items.length > 0 ? (
          <ul
            data-reveal=""
            className="home-portfolio-grid mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:auto-rows-[minmax(190px,20vw)] lg:gap-4"
          >
            {items.map((item, index) => {
              const image = safeImageUrl(item.imageUrl);
              return (
                <li
                  key={item.id}
                  className={`home-portfolio-card group relative min-h-[220px] overflow-hidden bg-brand-900 lg:min-h-0 ${
                    index === 0
                      ? "lg:col-span-2 lg:row-span-2"
                      : index === 3
                        ? "lg:col-span-2"
                        : ""
                  }`}
                >
                  <figure className="absolute inset-0">
                    <Image
                      src={image}
                      alt={item.title}
                      fill
                      sizes={
                        index === 0 || index === 3
                          ? "(max-width: 639px) 48vw, (max-width: 1023px) 46vw, 46vw"
                          : "(max-width: 639px) 48vw, (max-width: 1023px) 46vw, 24vw"
                      }
                      className="home-portfolio-image object-cover"
                      unoptimized={isRemoteImage(image)}
                    />
                    <span
                      aria-hidden="true"
                      className="home-portfolio-scrim absolute inset-0"
                    />
                    <figcaption className="absolute inset-x-0 bottom-0 p-3 text-right text-white sm:p-5">
                      <span className="block text-xs font-bold text-brass-200">
                        {galleryCategoryLabel(item.category)}
                      </span>
                      <span className="mt-1 block text-base font-black leading-6 text-balance sm:text-lg">
                        {item.title}
                      </span>
                      <span className="mt-1 block text-xs text-white/80">
                        {item.barberName}
                      </span>
                    </figcaption>
                  </figure>
                </li>
              );
            })}
          </ul>
        ) : (
          <p
            data-reveal=""
            className="mt-7 border-y border-bone-150 py-6 text-sm leading-7 text-bone-500"
          >
            نمونه‌کاری برای نمایش ثبت نشده است. برای دیدن آرایشگران و
            تخصص‌هایشان، بخش تیم را ببین.
          </p>
        )}
      </div>
    </section>
  );
}

export function HomeAcademy() {
  return (
    <section className="home-page-section public-container pb-14 sm:pb-16">
      <div
        data-reveal=""
        className="grid overflow-hidden rounded-[20px] bg-brand-50 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <div className="relative min-h-[230px] sm:min-h-[300px] lg:order-2 lg:min-h-[390px]">
          <Image
            src="/images/academy.jpg"
            alt=""
            fill
            sizes="(max-width: 1023px) 100vw, 48vw"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col items-start justify-center px-6 py-8 sm:px-10 sm:py-10 lg:order-1 lg:px-14">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-700">
            <Icon name="cap" className="h-5 w-5" weight="strong" />
          </span>
          <h2 className="mt-4 max-w-lg text-3xl leading-[1.35] font-black text-bone-700 text-balance sm:text-4xl">
            مهارت حرفه‌ای با تمرین ساخته می‌شود
          </h2>
          <p className="mt-3 max-w-lg text-base leading-8 text-bone-600">
            دوره‌ها و کارگاه‌های آکادمی را ببین و مسیر یادگیری پیرایش را شروع
            کن.
          </p>
          <Link href="/academy" className="ui-button mt-5 min-h-12 !px-6">
            دیدن دوره‌های آکادمی
          </Link>
        </div>
      </div>
    </section>
  );
}

export function HomeBookingCallout() {
  return (
    <section className="home-page-section public-container pb-14 sm:pb-16">
      <div
        data-reveal=""
        className="flex flex-col items-start justify-between gap-5 rounded-[20px] bg-bone-700 px-5 py-7 text-white sm:flex-row sm:items-center sm:px-9 sm:py-8"
      >
        <div className="max-w-2xl">
          <h2 className="text-2xl leading-[1.35] font-black text-balance sm:text-3xl">
            برای انتخاب خدمت راهنمایی می‌خواهی؟
          </h2>
          <p className="mt-2 text-sm leading-7 text-[#d5dfe0] sm:text-base">
            پذیرش برای انتخاب خدمت یا آرایشگر راهنمایی‌ات می‌کند.
          </p>
        </div>
        <a
          href={`tel:${CONTACT_PHONE_TEL}`}
          className="focus-ring inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-bone-700 transition-colors hover:bg-brand-50"
        >
          <Icon name="phone" className="h-4 w-4" weight="strong" />
          تماس با پذیرش
        </a>
      </div>
    </section>
  );
}
