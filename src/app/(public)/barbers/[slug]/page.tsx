import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { and, avg, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  barberServices,
  barberSkills,
  barbers,
  classes,
  portfolioItems,
  reviews,
  services,
  skills,
} from "@/db/schema";
import { resolveService, nextAvailable } from "@/lib/availability";
import { Badge, Stars } from "@/components/ui-cards";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { Icon } from "@/components/icons";
import { formatPersianDate, formatPrice, minutesToLabel, todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";
export default async function BarberProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [barber] = await db
    .select()
    .from(barbers)
    .where(and(eq(barbers.slug, slug), eq(barbers.active, true)))
    .limit(1);
  if (!barber) notFound();

  const [links, skillRows, work, reviewRows, summary, teaching] = await Promise.all([
    db
      .select({ service: services })
      .from(barberServices)
      .innerJoin(services, eq(barberServices.serviceId, services.id))
      .where(and(eq(barberServices.barberId, barber.id), eq(services.active, true))),
    db
      .select({ name: skills.name })
      .from(barberSkills)
      .innerJoin(skills, eq(barberSkills.skillId, skills.id))
      .where(and(eq(barberSkills.barberId, barber.id), eq(barberSkills.status, "APPROVED"))),
    db.select().from(portfolioItems).where(and(eq(portfolioItems.barberId, barber.id), eq(portfolioItems.isPublic, true))),
    db
      .select({ id: reviews.id, name: reviews.clientName, rating: reviews.rating, comment: reviews.comment })
      .from(reviews)
      .innerJoin(
        appointments,
        and(eq(appointments.id, reviews.appointmentId), eq(appointments.status, "COMPLETED")),
      )
      .where(eq(reviews.barberId, barber.id))
      .limit(8),
    db
      .select({ average: avg(reviews.rating), total: count() })
      .from(reviews)
      .innerJoin(
        appointments,
        and(eq(appointments.id, reviews.appointmentId), eq(appointments.status, "COMPLETED")),
      )
      .where(eq(reviews.barberId, barber.id)),
    db
      .select({ title: classes.title, slug: classes.slug, startsOn: classes.startsOn })
      .from(classes)
      .where(
        and(
          eq(classes.instructorBarberId, barber.id),
          eq(classes.status, "OPEN"),
          gte(classes.startsOn, todayISO()),
        ),
      ),
  ]);

  const offered = (
    await Promise.all(
      links.map(async ({ service }) => {
        const resolved = await resolveService(barber.id, service.id);
        return resolved
          ? {
              id: service.id,
              name: service.name,
              description: service.description,
              duration: resolved.durationMin,
              price: resolved.price,
            }
          : null;
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => Boolean(item));

  const next = offered[0] ? await nextAvailable(barber.id, offered[0].id) : null;
  const rating = summary[0]?.average ? Number(summary[0].average) : null;
  const total = Number(summary[0]?.total ?? 0);

  return (
    <div className="ui-shell">
      <div className="public-container public-page">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              name: barber.name,
              jobTitle: barber.title,
              worksFor: { "@type": "HealthAndBeautyBusiness", name: "آکادمی زیبایی فرشید معروف پور" },
            }),
          }}
        />
        <nav aria-label="مسیر" className="mb-4 flex items-center gap-2 text-sm text-bone-500">
          <Link className="ui-link" href="/barbers">آرایشگران</Link>
          <span>/</span>
          {barber.name}
        </nav>

        {/* Editorial profile header: portrait + identity + booking rail */}
        <div className="grid gap-6 md:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)] md:items-start md:gap-8 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)] lg:gap-10 xl:gap-12">
          <div className="relative aspect-[4/5] overflow-hidden bg-brand-50 lg:max-h-[640px]">
            {barber.imageUrl ? (
              <Image
                src={barber.imageUrl}
                alt={barber.name}
                fill
                priority
                sizes="(max-width:767px) 92vw, (max-width:1023px) 34vw, (max-width:1439px) 42vw, 520px"
                className="object-cover"
              />
            ) : (
              <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-6xl font-black text-brand-400">
                {barber.name[0]}
              </span>
            )}
          </div>

          <div>
            <Badge tone="brand">{barber.title}</Badge>
            <div className="mt-3 flex items-center gap-3">
              <ProfessionalAvatar name={barber.name} imageUrl={barber.imageUrl} size="lg" decorative />
              <h1 className="text-[clamp(28px,4vw,42px)] leading-[1.4] font-black">{barber.name}</h1>
            </div>
            <p className="mt-2 text-sm text-bone-500">
              {barber.experienceYears.toLocaleString("fa-IR")} سال سابقه
              {rating !== null && (
                <span className="mx-2 text-[#d6dad7]" aria-hidden="true">|</span>
              )}
              {rating !== null && (
                <span className="inline-flex items-center gap-1.5">
                  <Stars rating={rating} />
                  <b className="text-bone-700">{rating.toFixed(1)}</b>
                  <span>({total.toLocaleString("fa-IR")} نظر تأییدشده)</span>
                </span>
              )}
            </p>
            <p className="mt-5 max-w-2xl text-[15px] leading-8 text-bone-500">{barber.bio}</p>

            {skillRows.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {skillRows.map((skill) => (
                  <Badge key={skill.name}>{skill.name}</Badge>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3 rounded-[22px] border border-[#b7dfe1] bg-[#f0faf9] p-5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-bone-500">اولین زمان آزاد این آرایشگر</p>
                <p className="mt-1 text-base font-black text-brand-400">
                  {next
                    ? `${formatPersianDate(next.date)} — ساعت ${minutesToLabel(next.startMin)}`
                    : "در هفت روز نزدیک زمانی نیست؛ روزهای بعد را در رزرو بررسی کنید."}
                </p>
              </div>
              <Link
                href={
                  next && offered[0]
                    ? `/booking?barber=${barber.id}&services=${offered[0].id}&pref=PREFERRED_BARBER&date=${next.date}&time=${next.startMin}`
                    : `/booking?barber=${barber.id}&pref=PREFERRED_BARBER`
                }
                className="ui-button shrink-0"
              >
                <Icon name="calendar" className="h-4 w-4" />رزرو نوبت
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="min-w-0 space-y-12">
            {barber.readme && (
              <section>
                <h2 className="mb-4 text-xl font-black">دربارهٔ من</h2>
                <div className="max-w-3xl whitespace-pre-line text-[15px] leading-8 text-bone-500">
                  {barber.readme}
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-4 text-xl font-black">خدمات قابل رزرو</h2>
              {offered.length ? (
                <div className="divide-y divide-[#e5e0d4] border-y border-[#e5e0d4]">
                  {offered.map((service) => (
                    <div key={service.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-bold">{service.name}</h3>
                        <p className="mt-1 text-xs leading-6 text-bone-500">{service.description}</p>
                        <p className="mt-1 text-xs text-bone-500">
                          {service.duration.toLocaleString("fa-IR")} دقیقه · {formatPrice(service.price)}
                        </p>
                      </div>
                      <Link className="ui-button !min-h-11 self-start !text-xs sm:self-center" href={`/booking?services=${service.id}&barber=${barber.id}&pref=PREFERRED_BARBER`}>
                        رزرو
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ui-panel text-sm text-bone-500">در حال حاضر خدمتی برای رزرو فعال نیست.</p>
              )}
            </section>

            <section>
              <h2 className="mb-4 text-xl font-black">نمونه‌کارها</h2>
              {work.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {work.map((item) => (
                    <figure key={item.id} className="relative aspect-[4/5] overflow-hidden bg-brand-800">
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        fill
                        sizes="(max-width:640px) 45vw, 25vw"
                        className="object-cover"
                        unoptimized={!item.imageUrl.startsWith("/")}
                      />
                      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-brand-800/85 via-brand-800/10 to-transparent" />
                      <figcaption className="absolute inset-x-0 bottom-0 p-3 text-sm font-semibold text-white sm:p-4">
                        {item.title}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="ui-panel text-sm text-bone-500">هنوز نمونه‌کاری ثبت نشده است.</p>
              )}
            </section>

            {reviewRows.length > 0 && (
              <section>
                <h2 className="mb-4 text-xl font-black">نظر مشتریان</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {reviewRows.map((review) => (
                    <figure key={review.id} className="ui-card p-5">
                      <Stars rating={review.rating} />
                      <blockquote className="mt-2 text-sm leading-7">{review.comment}</blockquote>
                      <figcaption className="mt-3 text-xs text-bone-500">{review.name}</figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {teaching.length > 0 && (
              <section>
                <h2 className="mb-4 text-xl font-black">دوره‌های این مدرس</h2>
                {teaching.map((course) => (
                  <Link
                    href={`/classes/${course.slug}`}
                    key={course.slug}
                    className="ui-card mb-2.5 flex justify-between gap-3 p-5 text-sm"
                  >
                    <span className="font-bold">{course.title}</span>
                    <span className="text-bone-500">{formatPersianDate(course.startsOn)}</span>
                  </Link>
                ))}
              </section>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="ui-panel">
              <h2 className="font-black">رزرو سریع</h2>
              <p className="mt-3 text-sm leading-7 text-bone-500">
                {next
                  ? `نزدیک‌ترین زمان: ${formatPersianDate(next.date)}، ${minutesToLabel(next.startMin)}`
                  : "برای دیدن روزهای بعد، صفحه رزرو را باز کنید."}
              </p>
              <Link href={next && offered[0] ? `/booking?barber=${barber.id}&services=${offered[0].id}&pref=PREFERRED_BARBER&date=${next.date}&time=${next.startMin}` : `/booking?barber=${barber.id}&pref=PREFERRED_BARBER`} className="ui-button mt-5 w-full">
                انتخاب زمان نوبت
              </Link>
            </div>
            <div className="rounded-[22px] bg-[#e4ece3] p-5">
              <h3 className="text-sm font-bold text-brand-400">نکتهٔ رزرو</h3>
              <p className="mt-2 text-xs leading-7 text-[#2f4a33]">
                زمان‌های نمایش‌داده‌شده بر اساس برنامه واقعی کار آرایشگر محاسبه می‌شوند و هنگام ثبت نهایی
                دوباره در سرور بررسی می‌شوند.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
