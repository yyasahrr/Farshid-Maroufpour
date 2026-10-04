import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { CoursePlayer } from "@/components/course-player";
import { CourseReviewForm } from "@/components/course-review-form";
import { getCurrentUser } from "@/lib/session";
import { getLearnData } from "@/lib/course-queries";
import { formatPersianDate } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "پخش دوره آنلاین" };

export default async function CourseLearnPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  // customers have no password page: send them to the course page where the
  // OTP modal signs them in (or creates the account) and returns here.
  if (!user) redirect(`/courses/${slug}`);
  const data = await getLearnData(user.id, slug);
  if (!data) notFound();
  const { course, enrollment } = data;
  const requested = Number(query.lesson);
  const initialLesson = Number.isInteger(requested) && requested > 0 ? requested : null;
  const total = data.groups.reduce((sum, g) => sum + g.lessons.length, 0);
  const done = data.completedIds.length;

  return <div className="ui-shell"><div className="ui-container ui-page max-w-[1200px]">
    <nav aria-label="مسیر" className="mb-5 flex flex-wrap items-center gap-2 text-sm text-bone-500">
      <Link className="ui-link" href="/account">حساب من</Link><span>/</span>
      <Link className="ui-link" href={`/courses/${course.slug}`}>{course.title}</Link><span>/</span>درس‌ها
    </nav>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black">{course.title}</h1>
        <p className="mt-1 text-sm text-bone-500">
          {done.toLocaleString("fa-IR")} از {total.toLocaleString("fa-IR")} درس دیده‌شده
          {enrollment.status === "COMPLETED" ? " — دوره را کامل کرده‌اید" : ""}
        </p>
      </div>
      {enrollment.grade !== null && (
        <div className="ui-card px-4 py-2 text-sm">
          <span className="text-xs text-bone-500">نتیجه دوره شما</span>
          <p className="mt-0.5 font-black tabular-nums">{(enrollment.grade / 5).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} از ۲۰</p>
        </div>
      )}
    </div>

    <CoursePlayer
      courseSlug={course.slug}
      courseId={course.id}
      initialLessonId={initialLesson}
      groups={data.groups.map((g) => ({
        title: g.title,
        lessons: g.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          videoUrl: l.videoUrl,
          durationMin: l.durationMin,
          notes: l.notes,
          freePreview: l.freePreview,
          completed: l.completed,
        })),
      }))}
    />

    {enrollment.resultNote && (
      <aside className="mt-8 rounded-2xl bg-brand-50 p-5 text-sm leading-8 text-brand-400">
        <span className="ui-pill ui-tag-academy"><Icon name="cap" className="h-4 w-4" />بازخورد مدرس</span>
        <p className="mt-2 whitespace-pre-line">{enrollment.resultNote}</p>
        <p className="mt-1 text-[11px] text-bone-500">ثبت‌شده در {formatPersianDate(enrollment.updatedAt.toISOString().slice(0, 10))}</p>
      </aside>
    )}

    {enrollment.status === "COMPLETED" && (
      <section className="mt-8 max-w-xl" aria-label="ثبت نظر">
        <h2 className="text-lg font-black">تجربه شما برای بقیه</h2>
        <p className="mb-3 mt-1 text-sm leading-7 text-bone-500">دوره تمام شده؛ نظرتان پس از تأیید کادر آکادمی در صفحه دوره نمایش داده می‌شود.</p>
        <CourseReviewForm courseId={course.id} initialRating={0} initialComment="" />
      </section>
    )}
  </div></div>;
}
