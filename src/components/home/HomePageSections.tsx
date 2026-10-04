import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { HomePortfolioCurtain } from "@/components/home/HomePortfolioCurtain";
import type { getServices, getHomeBarbers } from "@/lib/queries";
import type { GalleryItem } from "@/lib/gallery";
import { formatPrice } from "@/lib/time";

type HomeService = Awaited<ReturnType<typeof getServices>>[number];
type HomeBarber = Awaited<ReturnType<typeof getHomeBarbers>>[number];

function BarberAvatar({ barber, size = "regular" }: { barber: HomeBarber; size?: "regular" | "large" }) {
  const dimensions = size === "large" ? "h-36 w-36 text-4xl sm:h-44 sm:w-44" : "h-24 w-24 text-3xl";

  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-brand-700 outline outline-1 outline-black/10 ${dimensions}`}>
      {barber.imageUrl ? (
        <Image src={barber.imageUrl} alt="" fill sizes={size === "large" ? "176px" : "96px"} className="object-cover" />
      ) : (
        <span aria-hidden="true">{barber.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

function BarberSkills({ skills }: { skills: string[] }) {
  return skills.length > 0 ? (
    <ul aria-label="تخصص‌ها" className="mt-4 flex flex-wrap gap-2">
      {skills.map((skill) => (
        <li key={skill} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-bone-600">
          {skill}
        </li>
      ))}
    </ul>
  ) : (
    <p className="mt-4 text-sm text-bone-500">برای دیدن تخصص‌ها، پروفایل را ببین.</p>
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
      description: "قیمت و زمان هر خدمت پیش از رفتن به مرحله رزرو نمایش داده می‌شود.",
    },
  ];

  return (
    <section id="about" className="home-page-section scroll-mt-24 bg-[#eeefe9] py-16 sm:py-20">
      <div className="ui-container">
        <div data-reveal="" className="max-w-2xl">
          <h2 className="text-3xl leading-[1.4] font-black text-bone-700 text-balance sm:text-4xl">
            دربارهٔ ما
          </h2>
          <p className="mt-3 max-w-xl text-base leading-8 text-bone-500">
            فرشید معروف پور، سالن پیرایش مردانه و آکادمی آموزش تخصصی را کنار هم گرد آورده است.
            خدمات، تخصص آرایشگران و دوره‌های آکادمی را بررسی کن و بعد مسیر مناسب خودت را انتخاب کن.
          </p>
        </div>
        <ol className="mt-9 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map((reason) => (
            <li key={reason.title} data-reveal="" className="flex gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-700">
                <Icon name={reason.icon} className="h-6 w-6" weight="strong" />
              </span>
              <div>
                <h3 className="text-base font-bold text-bone-700">{reason.title}</h3>
                <p className="mt-1 text-sm leading-7 text-bone-500">{reason.description}</p>
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
    <section id="services" className="home-page-section scroll-mt-24 bg-bone-100 py-16 sm:py-20">
      <div className="ui-container">
        <div data-reveal="" className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <h2 className="text-3xl leading-[1.4] font-black text-bone-700 text-balance sm:text-4xl">
              خدمات سالن
            </h2>
            <p className="mt-3 max-w-xl text-base leading-8 text-bone-500">
              خدمت دلخواهت را انتخاب کن؛ جزئیات و زمان‌های رزرو در دسترس است.
            </p>
          </div>
          <Link href="/services" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-brand-700 hover:bg-white/70">
            همهٔ خدمات <Icon name="arrow" className="h-4 w-4" weight="strong" />
          </Link>
        </div>

        {services.length > 0 ? (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {services.map((service, index) => (
              <li
                key={service.id}
                data-reveal=""
                className={index === 0 ? "sm:col-span-2" : ""}
              >
                <Link
                  href={`/services/${service.slug}`}
                  className={`focus-ring home-service-link group grid min-h-[112px] grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2 rounded-2xl bg-white px-4 py-4 hover:bg-[#f9fbf8] sm:px-5 md:flex md:items-center ${
                    index === 0 ? "sm:min-h-[132px] sm:px-7" : ""
                  }`}
                >
                  <span className="home-service-icon row-span-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-brand-50 text-brand-700">
                    <Icon name={serviceIcon(service.slug)} className="h-6 w-6" weight="strong" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-black text-bone-700">{service.name}</span>
                    <span className="text-pretty mt-1 block text-sm leading-6 text-bone-500">{service.description}</span>
                  </span>
                  <span className="home-service-price col-start-2 flex shrink-0 items-center justify-between gap-2 text-end md:block">
                    <span className="block text-sm font-bold text-bone-700">{formatPrice(service.basePrice)}</span>
                    <span className="mt-1 block text-xs text-bone-500">{service.durationMin.toLocaleString("fa-IR")} دقیقه</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p data-reveal="" className="mt-8 rounded-2xl bg-white px-5 py-6 text-sm leading-7 text-bone-500">
            در حال حاضر خدمتی برای رزرو ثبت نشده است. برای راهنمایی با پذیرش تماس بگیر.
          </p>
        )}
      </div>
    </section>
  );
}

export function HomeTeam({ barbers }: { barbers: HomeBarber[] }) {
  const founder = barbers.find((barber) => barber.title.includes("بنیان‌گذار"));
  const teamMembers = founder ? barbers.filter((barber) => barber.id !== founder.id) : barbers;

  return (
    <section id="team" className="home-page-section scroll-mt-24 bg-[#eeefe9] py-16 sm:py-20">
      <div className="ui-container">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div data-reveal="" className="max-w-2xl">
          <h2 className="text-3xl leading-[1.4] font-black text-bone-700 text-balance sm:text-4xl">
            با تیم ما آشنا شو
          </h2>
          <p className="mt-3 max-w-xl text-base leading-8 text-bone-500">
            تخصص هر آرایشگر را ببین و کسی را انتخاب کن که با خواسته‌ات هماهنگ است.
          </p>
        </div>
        <Link href="/barbers" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-brand-700 hover:bg-brand-50">
          دیدن همهٔ آرایشگران <Icon name="arrow" className="h-4 w-4" weight="strong" />
        </Link>
      </div>

      {founder && (
        <article data-reveal="" className="mt-9 grid gap-6 rounded-[26px] bg-brand-50 p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8 sm:p-8">
          <Link href={`/barbers/${founder.slug}`} aria-label={`پروفایل ${founder.name}`} className="focus-ring mx-auto rounded-full sm:mx-0">
            <BarberAvatar barber={founder} size="large" />
          </Link>
          <div className="min-w-0 text-center sm:text-right">
            <p className="text-sm font-bold text-brand-700">بنیان‌گذار آکادمی</p>
            <h3 className="mt-2 text-2xl font-black text-bone-700 sm:text-3xl">{founder.name}</h3>
            <p className="mt-1 text-sm font-semibold text-bone-600">{founder.title}</p>
            {founder.bio && <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-bone-600 sm:mx-0">{founder.bio}</p>}
            <div className="flex justify-center sm:justify-start">
              <BarberSkills skills={founder.serviceNames} />
            </div>
            <Link href={`/barbers/${founder.slug}`} className="ui-button mt-5 min-h-11 !px-5">
              دیدن پروفایل بنیان‌گذار
            </Link>
          </div>
        </article>
      )}

      {barbers.length > 0 ? (
        <div className="mt-10">
          {teamMembers.length > 0 && (
            <h3 data-reveal="" className="text-xl font-black text-bone-700">آرایشگران تیم</h3>
          )}
          {teamMembers.length > 0 ? (
            <ul className={`mt-5 grid gap-5 lg:[grid-template-columns:repeat(auto-fit,280px)] lg:justify-center ${founder ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
              {teamMembers.map((barber) => (
                <li key={barber.id} data-reveal="" className="min-w-0">
                  <article className="home-team-member flex h-full flex-col items-center rounded-2xl px-4 py-5 text-center">
                    <Link href={`/barbers/${barber.slug}`} aria-label={`پروفایل ${barber.name}`} className="focus-ring rounded-full">
                      <BarberAvatar barber={barber} />
                    </Link>
                    <h4 className="mt-4 text-lg font-black text-bone-700">
                      <Link href={`/barbers/${barber.slug}`} className="focus-ring rounded-sm">{barber.name}</Link>
                    </h4>
                    <p className="mt-1 text-sm text-bone-500">{barber.title}</p>
                    <BarberSkills skills={barber.serviceNames} />
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
        <p data-reveal="" className="mt-8 rounded-2xl bg-white px-5 py-6 text-sm leading-7 text-bone-500">
          فهرست آرایشگران در حال تکمیل است. برای انتخاب متخصص با پذیرش تماس بگیر.
        </p>
      )}
      </div>
    </section>
  );
}

export function HomePortfolio({ items }: { items: GalleryItem[] }) {
  return (
    <section id="work" className="home-page-section scroll-mt-24 bg-bone-100 py-16 sm:py-20">
      <div className="ui-container">
        <div data-reveal="" className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <h2 className="text-3xl leading-[1.4] font-black text-bone-700 text-balance sm:text-4xl">
              نمونه‌کارهای تیم
            </h2>
            <p className="mt-3 max-w-xl text-base leading-8 text-bone-500">
              سبک‌های ثبت‌شده توسط آرایشگران را ببین و برای آشنایی با هر متخصص، پروفایلش را باز کن.
            </p>
          </div>
          <Link href="/work" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-brand-700 hover:bg-white/70">
            همهٔ نمونه‌کارها <Icon name="arrow" className="h-4 w-4" weight="strong" />
          </Link>
        </div>

        {items.length > 0 ? (
          <div data-reveal="">
            <HomePortfolioCurtain items={items} />
          </div>
        ) : (
          <p data-reveal="" className="mt-8 rounded-2xl bg-white px-5 py-6 text-sm leading-7 text-bone-500">
            نمونه‌کاری برای نمایش ثبت نشده است. برای دیدن آرایشگران و تخصص‌هایشان، بخش تیم را ببین.
          </p>
        )}
      </div>
    </section>
  );
}

export function HomeAcademy() {
  return (
    <section className="home-page-section ui-container pb-16 sm:pb-20">
      <div data-reveal="" className="grid overflow-hidden rounded-[28px] bg-brand-50 lg:grid-cols-[1.05fr_0.95fr]">
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
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-700">
            <Icon name="cap" className="h-6 w-6" weight="strong" />
          </span>
          <h2 className="mt-5 max-w-lg text-3xl leading-[1.4] font-black text-bone-700 text-balance sm:text-4xl">
            مهارت حرفه‌ای با تمرین ساخته می‌شود
          </h2>
          <p className="mt-3 max-w-lg text-base leading-8 text-bone-600">
            دوره‌ها و کارگاه‌های آکادمی را ببین و مسیر یادگیری پیرایش را شروع کن.
          </p>
          <Link href="/academy" className="ui-button mt-6 min-h-12 !px-6">
            دیدن دوره‌های آکادمی
          </Link>
        </div>
      </div>
    </section>
  );
}

export function HomeBookingCallout() {
  return (
    <section className="home-page-section ui-container pb-16 sm:pb-20">
      <div data-reveal="" className="flex flex-col items-start justify-between gap-6 rounded-[26px] bg-bone-700 px-6 py-8 text-white sm:flex-row sm:items-center sm:px-10 sm:py-9">
        <div className="max-w-2xl">
          <h2 className="text-2xl leading-[1.4] font-black text-balance sm:text-3xl">
            برای انتخاب خدمت راهنمایی می‌خواهی؟
          </h2>
          <p className="mt-2 text-sm leading-7 text-[#d5dfe0] sm:text-base">
            پذیرش برای انتخاب خدمت یا آرایشگر راهنمایی‌ات می‌کند.
          </p>
        </div>
        <a href="tel:+982191000000" className="focus-ring inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-bone-700 transition-colors hover:bg-brand-50">
          <Icon name="phone" className="h-4 w-4" weight="strong" />
          تماس با پذیرش
        </a>
      </div>
    </section>
  );
}
