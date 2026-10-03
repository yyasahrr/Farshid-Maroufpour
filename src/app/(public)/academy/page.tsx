import Link from "next/link";
import Image from "next/image";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { barbers, classes } from "@/db/schema";
import { CourseCard, WorkshopCard } from "@/components/course-cards";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/ui-cards";
import { getCourseCards, getWorkshopCards } from "@/lib/queries";
import { CONTACT_PHONE_TEL } from "@/lib/site";
import { todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "آکادمی", description: "دوره‌های عملی پیرایش مردانه؛ برنامه، مدرس، ظرفیت و شهریه را پیش از ثبت‌نام ببینید." };

export default async function AcademyPage() {
  const [courses, workshops, instructors] = await Promise.all([
    getCourseCards(),
    getWorkshopCards(),
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
        <section className="relative mb-16 overflow-hidden rounded-[30px] bg-[#e3f0e9]">
          <div className="absolute inset-0 -z-10 opacity-25" aria-hidden="true">
            <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-[#3f5548]/30 blur-3xl" />
          </div>
          <div className="grid gap-8 p-7 sm:p-12 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <span className="ui-pill bg-white/85 text-[#2f4a3a]">
                <Icon name="cap" className="h-4 w-4" /> آکادمی
              </span>
              <h1 data-reveal="" className="mt-5 max-w-lg text-[clamp(28px,4.5vw,48px)] leading-[1.35] font-black">
                مهارت، با تمرین واقعی آغاز می‌شود.
              </h1>
              <p data-reveal="" className="mt-4 max-w-lg text-[15px] leading-9 text-[#8a6a1e]">
                دوره‌ها، مدرس‌ها و ظرفیت کلاس‌ها را ببینید و برای برنامه مناسب خود ثبت‌نام کنید. همه
                برنامه‌ها بر اساس ظرفیت واقعی و مدرس ثبت‌شده نمایش داده می‌شوند.
              </p>
              <div data-reveal="" className="mt-7 flex flex-wrap gap-3">
                <Link href="#courses" className="ui-button">
                  دیدن دوره‌ها<Icon name="arrow" className="h-4 w-4" />
                </Link>
                <Link href="#instructors" className="ui-button ui-button-quiet">
                  مدرسان دوره‌ها
                </Link>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {[
                { value: courses.length.toLocaleString("fa-IR"), label: "دورهٔ باز" },
                { value: workshops.length.toLocaleString("fa-IR"), label: "کارگاه حضوری" },
                { value: uniqueInstructors.length.toLocaleString("fa-IR"), label: "مدرس فعال" },
                { value: "عملی", label: "روش آموزش" },
              ].map((item) => (
                <div data-reveal="" key={item.label} className="rounded-[20px] bg-white/80 p-4">
                  <dd className="text-2xl font-black tabular-nums text-[#2f4a3a]">{item.value}</dd>
                  <dt className="mt-1 text-xs text-[#5a628f]">{item.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="courses" className="scroll-mt-24">
          <div className="ui-section-head">
            <h2>دوره‌های در حال ثبت‌نام</h2>
            <span className="ui-pill ui-tag-academy">{courses.length.toLocaleString("fa-IR")} دوره</span>
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
          <section className="mt-16">
            <div className="ui-section-head"><h2>کارگاه‌های حضوری</h2></div>
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
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[#e3f0e9]">
                    {instructor.imageUrl ? (
                      <Image
                        src={instructor.imageUrl}
                        alt={instructor.name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-black text-[#2f4a3a]">
                        {instructor.name[0]}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm">{instructor.name}</strong>
                    <small className="text-[#5f7168]">{instructor.title}</small>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <aside className="mt-16 rounded-[26px] bg-[#1f2e27] p-7 text-white sm:p-10">
          <h2 className="text-xl font-black">برای انتخاب دوره راهنمایی می‌خواهید؟</h2>
          <p className="mt-2 max-w-xl text-sm leading-8 text-[#d5dfe0]">
            ظرفیت، سطح و تاریخ برگزاری در جزئیات هر دوره آمده است. برای پرسش‌های بیشتر با آکادمی تماس
            بگیرید.
          </p>
          <a className="ui-button mt-6 !bg-white !text-[#1f2e27]" href={`tel:${CONTACT_PHONE_TEL}`}>
            <Icon name="phone" className="h-4 w-4" />تماس با پذیرش
          </a>
        </aside>
      </div>
    </div>
  );
}
