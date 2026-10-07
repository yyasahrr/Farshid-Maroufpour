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
    db.select().from(portfolioItems).where(eq(portfolioItems.barberId, barber.id)),
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
      <div className="ui-container ui-page max-w-[1120px]">
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
        <nav aria-label="مسیر" className="mb-5 flex items-center gap-2 text-sm text-[#5f7168]">
          <Link className="ui-link" href="/barbers">آرایشگران</Link>
          <span>/</span>
          {barber.name}
        </nav>

        {/* Editorial profile header: portrait + identity + booking rail */}
        <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[26px] bg-[#e2efe8]">
            {barber.imageUrl ? (
              <Image
                src={barber.imageUrl}
                alt={barber.name}
                fill
                priority
                sizes="(max-width:1024px) 90vw, 300px"
                className="object-cover"
              />
            ) : (
              <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-6xl font-black text-[#2f4a3a]">
                {barber.name[0]}
              </span>
            )}
          </div>

          <div>
            <Badge tone="brand">{barber.title}</Badge>
            <h1 className="mt-3 text-[clamp(28px,4vw,42px)] leading-[1.4] font-black">{barber.name}</h1>
            <p className="mt-2 text-sm text-[#5f7168]">
              {barber.experienceYears.toLocaleString("fa-IR")} سال سابقه
              {rating !== null && (
                <span className="mx-2 text-[#d6dad7]" aria-hidden="true">|</span>
              )}
              {rating !== null && (
                <span className="inline-flex items-center gap-1.5">
                  <Stars rating={rating} />
                  <b className="text-[#1f2e27]">{rating.toFixed(1)}</b>
                  <span>({total.toLocaleString("fa-IR")} نظر تأییدشده)</span>
                </span>
              )}
            </p>
            <p className="mt-5 max-w-2xl text-[15px] leading-9 text-[#5f7168]">{barber.bio}</p>

            {skillRows.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {skillRows.map((skill) => (
                  <Badge key={skill.name}>{skill.name}</Badge>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3 rounded-[22px] border border-[#b7dfe1] bg-[#f0faf9] p-5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#5f7168]">اولین زمان آزاد این آرایشگر</p>
                <p className="mt-1 text-base font-black text-[#2f4a3a]">
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
                <div className="ui-card whitespace-pre-line p-6 text-[15px] leading-9 text-[#5f7168]">
                  {barber.readme}
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-4 text-xl font-black">خدمات قابل رزرو</h2>
              {offered.length ? (
                <div className="space-y-2.5">
                  {offered.map((service) => (
                    <div key={service.id} className="ui-card flex flex-wrap items-center justify-between gap-3 p-5">
                      <div className="min-w-0">
                        <h3 className="font-bold">{service.name}</h3>
                        <p className="mt-1 text-xs leading-6 text-[#5f7168]">{service.description}</p>
                        <p className="mt-1 text-xs text-[#5f7168]">
                          {service.duration.toLocaleString("fa-IR")} دقیقه · {formatPrice(service.price)}
                        </p>
                      </div>
                      <Link className="ui-button !min-h-11 !text-xs" href={`/booking?services=${service.id}&barber=${barber.id}&pref=PREFERRED_BARBER`}>
                        رزرو
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ui-panel text-sm text-[#5f7168]">در حال حاضر خدمتی برای رزرو فعال نیست.</p>
              )}
            </section>

            <section>
              <h2 className="mb-4 text-xl font-black">نمونه‌کارها</h2>
              {work.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {work.map((item) => (
                    <figure key={item.id} className="ui-card overflow-hidden !rounded-[18px]">
                      <div className="relative aspect-square overflow-hidden bg-[#e3f0e9]">
                        <Image
                          src={item.imageUrl}
                          alt={item.title}
                          fill
                          sizes="(max-width:640px) 45vw, 25vw"
                          className="object-cover"
                          unoptimized={!item.imageUrl.startsWith("/")}
                        />
                      </div>
                      <figcaption className="p-3 text-xs font-semibold">{item.title}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="ui-panel text-sm text-[#5f7168]">هنوز نمونه‌کاری ثبت نشده است.</p>
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
                      <figcaption className="mt-3 text-xs text-[#5f7168]">{review.name}</figcaption>
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
                    <span className="text-[#5f7168]">{formatPersianDate(course.startsOn)}</span>
                  </Link>
                ))}
              </section>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="ui-panel">
              <h2 className="font-black">رزرو سریع</h2>
              <p className="mt-3 text-sm leading-7 text-[#5f7168]">
                {next
                  ? `نزدیک‌ترین زمان: ${formatPersianDate(next.date)}، ${minutesToLabel(next.startMin)}`
                  : "برای دیدن روزهای بعد، صفحه رزرو را باز کنید."}
              </p>
              <Link href={next && offered[0] ? `/booking?barber=${barber.id}&services=${offered[0].id}&pref=PREFERRED_BARBER&date=${next.date}&time=${next.startMin}` : `/booking?barber=${barber.id}&pref=PREFERRED_BARBER`} className="ui-button mt-5 w-full">
                انتخاب زمان نوبت
              </Link>
            </div>
            <div className="rounded-[22px] bg-[#e4ece3] p-5">
              <h3 className="text-sm font-bold text-[#2f4a3a]">نکتهٔ رزرو</h3>
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
