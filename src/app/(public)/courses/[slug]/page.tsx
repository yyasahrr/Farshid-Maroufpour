import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseEnrollments } from "@/db/schema";
import { CourseEnrollForm } from "@/components/course-enroll-form";
import { CourseReviewForm } from "@/components/course-review-form";
import { Badge } from "@/components/ui-cards";
import { Icon } from "@/components/icons";
import { getCurrentUser } from "@/lib/session";
import { formatPrice } from "@/lib/time";
import { demoPhoneHint } from "@/lib/preview";
import { getCoursePage } from "@/lib/course-queries";

export const dynamic = "force-dynamic";
const levels: Record<string, string> = { BEGINNER: "مقدماتی", INTERMEDIATE: "متوسط", ADVANCED: "پیشرفته" };

export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, user] = await Promise.all([getCoursePage(slug), getCurrentUser()]);
  if (!data) notFound();
  const { course } = data;
  if (course.status !== "PUBLISHED" && !user?.permissions.has("academy:manage")) notFound();
  const free = course.capacity === 0 ? Infinity : Math.max(0, course.capacity - course.seatsTaken);
  const unavailable = course.status !== "PUBLISHED" || free < 1;
  const outcomes = course.outcomes.split("\n").map((l) => l.trim()).filter(Boolean);
  const totalMinutes = data.sections.reduce((sum, s) => sum + s.lessons.reduce((x, l) => x + l.durationMin, 0), 0);
  const myEnrollment = user
    ? (await db.select().from(courseEnrollments)
        .where(and(eq(courseEnrollments.courseId, course.id), eq(courseEnrollments.userId, user.id)))
        .limit(1))[0] ?? null
    : null;
  const canReview = myEnrollment && (myEnrollment.status === "ACTIVE" || myEnrollment.status === "COMPLETED");

  return <div className="ui-shell"><div className="ui-container ui-page max-w-[1100px]">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Course", name: course.title, description: course.summary, provider: { "@type": "Organization", name: "آکادمی زیبایی فرشید معروف پور" } }) }} />
    <nav aria-label="مسیر" className="mb-5 flex items-center gap-2 text-sm text-bone-500"><Link className="ui-link" href="/academy">آکادمی</Link><span>/</span><Link className="ui-link" href="/academy#online">دوره‌های آنلاین</Link><span>/</span>{course.title}</nav>

    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0">
        {course.status !== "PUBLISHED" && <Badge tone="warn">پیش‌نمایش — فقط برای کادر آکادمی دیده می‌شود</Badge>}
        <Badge tone="brand">{levels[course.level] ?? course.level}</Badge>
        <h1 className="mt-3 text-[clamp(28px,4vw,40px)] leading-[1.5] font-black">{course.title}</h1>
        <p className="mt-3 text-[15px] leading-8 text-bone-500">{course.summary}</p>

        {course.teaserVideoUrl && (
          <section className="mt-7 overflow-hidden rounded-[22px] bg-black" aria-label="تیزر دوره">
            { }
            <video controls playsInline preload="metadata" poster={course.posterUrl ?? undefined} className="aspect-video w-full" src={course.teaserVideoUrl} />
            <p className="px-4 py-2.5 text-xs font-bold text-white/70">تیزر دوره — قبل از ثبت‌نام ببینید</p>
          </section>
        )}

        {course.description && (
          <section className="mt-9">
            <h2 className="text-xl font-black">درباره دوره</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-9 text-bone-600">{course.description}</p>
          </section>
        )}

        {outcomes.length > 0 && (
          <section className="mt-9">
            <h2 className="text-xl font-black">بعد از این دوره چه می‌توانید انجام دهید؟</h2>
            <ul className="mt-4 space-y-2">{outcomes.map((item) => (
              <li key={item} className="ui-card flex items-start gap-3 p-4 text-sm leading-7"><Icon name="check" className="mt-1 h-5 w-5 shrink-0 text-brand-400" />{item}</li>
            ))}</ul>
          </section>
        )}

        <section className="mt-9" aria-label="سرفصل‌های دوره">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xl font-black">سرفصل‌ها و درس‌ها</h2>
            <span className="text-xs text-bone-500">{data.sections.reduce((s, x) => s + x.lessons.length, 0).toLocaleString("fa-IR")} درس · {totalMinutes ? `${Math.round(totalMinutes / 60)} ساعت` : "—"}</span>
          </div>
          <div className="mt-4 space-y-3">
            {data.sections.length === 0 && <p className="ui-panel text-sm text-bone-500">سرفصلی هنوز تعریف نشده است.</p>}
            {data.sections.map((section) => (
              <details key={section.id} className="ui-card overflow-hidden" open>
                <summary className="cursor-pointer list-none p-4 text-sm font-black">{section.title}<span className="mt-1 block text-xs font-normal text-bone-500">{section.lessons.length.toLocaleString("fa-IR")} درس</span></summary>
                <ol className="divide-y divide-bone-200 border-t border-bone-150">
                  {section.lessons.map((lesson, index) => (
                    <li key={lesson.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <span className="w-6 shrink-0 text-xs text-brass-800 tabular-nums">{(index + 1).toLocaleString("fa-IR")}.</span>
                      <span className="min-w-0 flex-1 font-semibold">{lesson.title}</span>
                      {lesson.durationMin > 0 && <span className="text-xs text-bone-500 tabular-nums">{lesson.durationMin.toLocaleString("fa-IR")} دقیقه</span>}
                      {lesson.freePreview && lesson.videoUrl && (
                        <details className="shrink-0">
                          <summary className="focus-ring min-h-11 cursor-pointer list-none rounded-full bg-brand-50 px-3 text-xs font-black text-brand-400">نمونه رایگان</summary>
                          { }
                          <video controls autoPlay playsInline className="fixed inset-x-4 top-16 z-50 max-h-[70vh] rounded-2xl bg-black shadow-2xl" src={lesson.videoUrl} />
                        </details>
                      )}
                      {lesson.videoUrl === null && <span className="rounded-full bg-brass-50 px-2.5 py-0.5 text-[10px] font-black text-brass-700">به‌زودی</span>}
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-6 text-[#8d968f]">درس‌ها پس از ثبت‌نام قطعی در پنل شما باز می‌شوند؛ درس‌های «نمونه رایگان» برای همه قابل تماشا هستند.</p>
        </section>

        <section className="mt-10" aria-label="نظرات دانشجوها">
          <div className="ui-section-head"><h2>نظرات دانشجوها</h2>
            {data.ratingCount > 0 && <span className="ui-pill ui-tag-academy tabular-nums">{data.ratingAvg?.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ★ از {data.ratingCount.toLocaleString("fa-IR")} نظر</span>}
          </div>
          {data.reviews.length === 0 ? (
            <p className="ui-panel text-sm leading-8 text-bone-500">هنوز نظری تأیید نشده است. اولین نفر باشید که تجربه‌اش را می‌نویسد.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.reviews.map((review) => (
                <li key={review.id} className="ui-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm">{review.name}</strong>
                    <span dir="ltr" className="text-sm text-brass-700 tabular-nums" aria-label={`${review.rating} ستاره`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                  </div>
                  {review.comment && <p className="mt-2 text-sm leading-8 text-bone-600">{review.comment}</p>}
                  <time className="mt-1 block text-[11px] text-[#8d968f]">{new Intl.DateTimeFormat("fa-IR", { dateStyle: "long" }).format(review.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
          {canReview && (
            <div className="mt-5">
              <CourseReviewForm courseId={course.id} initialRating={0} initialComment="" />
            </div>
          )}
        </section>
      </div>

      <aside className="ui-panel lg:sticky lg:top-24">
        <p className="text-sm text-bone-500">شهریه دوره</p>
        <p className="mt-1 text-2xl font-black tabular-nums">{course.price === 0 ? "رایگان" : formatPrice(course.price)}</p>
        <p className="mt-3 text-sm text-brass-800">
          {unavailable ? (course.status !== "PUBLISHED" ? "این دوره فعلاً در دسترس نیست" : "ظرفیت این دوره تکمیل شده است")
            : course.capacity === 0 ? "ظرفیت نامحدود" : `${free.toLocaleString("fa-IR")} جای خالی از ${course.capacity.toLocaleString("fa-IR")}`}
        </p>
        <dl className="mt-4 space-y-1.5 border-t border-bone-150 pt-4 text-xs text-bone-500">
          <div className="flex justify-between gap-2"><dt>مدرس</dt><dd className="font-bold text-bone-700">{data.instructorName ?? "آکادمی فرشید"}</dd></div>
          <div className="flex justify-between gap-2"><dt>تعداد درس</dt><dd className="font-bold tabular-nums text-bone-700">{data.sections.reduce((s, x) => s + x.lessons.length, 0).toLocaleString("fa-IR")}</dd></div>
          <div className="flex justify-between gap-2"><dt>دسترسی</dt><dd className="font-bold text-bone-700">پس از خرید، همیشگی</dd></div>
          {course.capacity > 0 && <div className="flex justify-between gap-2"><dt>ثبت‌نام‌شده</dt><dd className="font-bold tabular-nums text-bone-700">{course.seatsTaken.toLocaleString("fa-IR")} نفر</dd></div>}
        </dl>
        <div className="ui-rule my-5" />
        {myEnrollment && (myEnrollment.status === "ACTIVE" || myEnrollment.status === "COMPLETED") ? (
          <Link href={`/courses/${course.slug}/learn`} className="ui-button w-full">ورود به درس‌ها</Link>
        ) : (
          <CourseEnrollForm
            courseId={course.id}
            courseSlug={course.slug}
            price={course.price}
            unavailable={unavailable}
            initialUser={user ? { id: user.id, name: user.name, phone: user.phone, role: user.role } : null}
            demoPhoneHint={demoPhoneHint()}
          />
        )}
        <Link href="/academy#online" className="ui-button ui-button-quiet mt-2 w-full !min-h-11 !text-xs">بازگشت به دوره‌های آنلاین</Link>
      </aside>
    </div>
  </div></div>;
}
