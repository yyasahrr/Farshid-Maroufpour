import Link from "next/link";
import Image from "next/image";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { barbers, classes } from "@/db/schema";
import { CourseCard, WorkshopCard } from "@/components/course-cards";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/ui-cards";
import { getCourseCards, getWorkshopCards } from "@/lib/queries";
import { getPublishedCourses } from "@/lib/course-queries";
import { OnlineCourseCard } from "@/components/course-cards";
import { CONTACT_PHONE_TEL } from "@/lib/site";
import { todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "آکادمی", description: "دوره‌های عملی پیرایش مردانه؛ برنامه، مدرس، ظرفیت و شهریه را پیش از ثبت‌نام ببینید." };

export default async function AcademyPage() {
  const [courses, workshops, onlineCourses, instructors] = await Promise.all([
    getCourseCards(),
    getWorkshopCards(),
    getPublishedCourses(),
    db
      .select({ id: barbers.id, slug: barbers.slug, name: barbers.name, title: barbers.title, imageUrl: barbers.imageUrl })
      .from(classes)
      .innerJoin(barbers, eq(classes.instructorBarberId, barbers.id))
      .where(and(eq(classes.status, "OPEN"), gte(classes.startsOn, todayISO()))),
  ]);
  const uniqueInstructors = instructors.filter(
    (value, index, all) => all.findIndex((item) => item.id === value.id) === index,
  );

  return (
    <div className="ui-shell">
      <div className="ui-container ui-page">
        {/* Editorial academy hero */}
        <section className="relative mb-16 overflow-hidden rounded-[30px] bg-brand-50">
          <div className="absolute inset-0 -z-10 opacity-25" aria-hidden="true">
            <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-bone-600/30 blur-3xl" />
          </div>
          <div className="grid gap-8 p-7 sm:p-12 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <span className="ui-pill bg-white/85 text-brand-400">
                <Icon name="cap" className="h-4 w-4" /> آکادمی
              </span>
              <h1 data-reveal="" className="mt-5 max-w-lg text-[clamp(28px,4.5vw,48px)] leading-[1.35] font-black">
                مهارت، با تمرین واقعی آغاز می‌شود.
              </h1>
              <p data-reveal="" className="mt-4 max-w-lg text-[15px] leading-9 text-brass-800">
                دو مسیر آموزشی داریم: دوره‌های آنلاین با ویدیو، سرفصل و مدرک، و کارگاه‌های حضوری در سالن.
                ظرفیت و مدرس هر برنامه واقعی و ثبت‌شده است.
              </p>
              <div data-reveal="" className="mt-7 flex flex-wrap gap-3">
                <Link href="#online" className="ui-button">
                  دوره‌های آنلاین<Icon name="arrow" className="h-4 w-4" />
                </Link>
                <Link href="#inperson" className="ui-button ui-button-quiet">
                  کارگاه‌های حضوری
                </Link>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {[
                { value: onlineCourses.length.toLocaleString("fa-IR"), label: "دوره آنلاین" },
                { value: (courses.length + workshops.length).toLocaleString("fa-IR"), label: "کارگاه حضوری" },
                { value: uniqueInstructors.length.toLocaleString("fa-IR"), label: "مدرس فعال" },
                { value: "عملی", label: "روش آموزش" },
              ].map((item) => (
                <div data-reveal="" key={item.label} className="rounded-[20px] bg-white/80 p-4">
                  <dd className="text-2xl font-black tabular-nums text-brand-400">{item.value}</dd>
                  <dt className="mt-1 text-xs text-[#5a628f]">{item.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="online" className="scroll-mt-24">
          <div className="ui-section-head">
            <h2>دوره‌های آنلاین</h2>
            <span className="ui-pill ui-tag-academy">{onlineCourses.length.toLocaleString("fa-IR")} دوره</span>
          </div>
          {onlineCourses.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {onlineCourses.map((course) => (
                <div key={course.slug} data-reveal="">
                  <OnlineCourseCard course={course} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="اولین دوره آنلاین در حال آماده‌سازی است"
              description="به‌محض انتشار، سرفصل‌ها، تیزر و ظرفیت همین‌جا نمایش داده می‌شود. کارگاه‌های حضوری را از بخش بعد ببینید."
            />
          )}
        </section>

        <section id="inperson" className="mt-16 scroll-mt-24">
          <div className="ui-section-head">
            <h2>کارگاه‌های حضوری</h2>
            <span className="ui-pill ui-tag-academy">{courses.length.toLocaleString("fa-IR")} دوره در حال ثبت‌نام</span>
          </div>
          {courses.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => (
                <div key={course.slug} data-reveal="">
                  <CourseCard course={course} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="فعلاً دوره‌ای برای ثبت‌نام باز نیست"
              description="برای اطلاع از دوره‌های آینده با پذیرش آکادمی در تماس باشید."
            />
          )}
        </section>

        {workshops.length > 0 && (
          <section className="mt-10">
            <div className="ui-section-head"><h3 className="text-lg font-black">masterclass‌ها و کارگاه‌های فشرده</h3></div>
            <div className="space-y-3">
              {workshops.map((workshop) => (
                <div key={workshop.slug} data-reveal="">
                  <WorkshopCard workshop={workshop} />
                </div>
              ))}
            </div>
          </section>
        )}

        {uniqueInstructors.length > 0 && (
          <section id="instructors" className="mt-16 scroll-mt-24">
            <div className="ui-section-head"><h2>مدرس‌های دوره‌های جاری</h2></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {uniqueInstructors.map((instructor) => (
                <Link
                  key={instructor.id}
                  href={`/barbers/${instructor.slug}`}
                  data-reveal=""
                  className="ui-card bento-card-interactive flex items-center gap-4 p-4"
                >
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-brand-50">
                    {instructor.imageUrl ? (
                      <Image
                        src={instructor.imageUrl}
                        alt={instructor.name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-black text-brand-400">
                        {instructor.name[0]}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm">{instructor.name}</strong>
                    <small className="text-bone-500">{instructor.title}</small>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <aside className="mt-16 rounded-[26px] bg-bone-700 p-7 text-white sm:p-10">
          <h2 className="text-xl font-black">برای انتخاب دوره راهنمایی می‌خواهید؟</h2>
          <p className="mt-2 max-w-xl text-sm leading-8 text-bone-300">
            ظرفیت، سطح و تاریخ برگزاری در جزئیات هر دوره آمده است. برای پرسش‌های بیشتر با آکادمی تماس
            بگیرید.
          </p>
          <a className="ui-button mt-6 !bg-white !text-bone-700" href={`tel:${CONTACT_PHONE_TEL}`}>
            <Icon name="phone" className="h-4 w-4" />تماس با پذیرش
          </a>
        </aside>
      </div>
    </div>
  );
}
