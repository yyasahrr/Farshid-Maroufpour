import Image from "next/image";
import Link from "next/link";
import { formatPersianDate, formatPrice } from "@/lib/time";
import { Badge } from "@/components/ui-cards";
import { Icon } from "@/components/icons";

const LEVEL: Record<string, string> = { BEGINNER: "مقدماتی", INTERMEDIATE: "متوسط", ADVANCED: "پیشرفته" };
export type CourseCardData = {
  slug: string; title: string; description: string; level: string; price: number; startsOn: string;
  sessions: number; capacity: number; seatsTaken: number; instructorName: string | null;
  instructorRating: number | null; instructorSlug: string | null; outcomes: string[];
};
export type WorkshopCardData = {
  slug: string; title: string; description: string; instructorName: string | null;
  startsOn: string; sessions: number; capacity: number; seatsTaken: number;
  price: number; location: string; imageUrl: string;
};
export function CourseCard({ course }: { course: CourseCardData }) {
  const left = Math.max(0, course.capacity - course.seatsTaken);
  return <article className="ui-card flex h-full flex-col overflow-hidden"><div className="relative aspect-[16/9] bg-[#e3f0e9]"><Image src="/images/academy.jpg" alt="" fill sizes="(max-width:768px) 100vw, 33vw" className="object-cover" /><span className="absolute right-4 top-4 ui-pill ui-tag-academy">{LEVEL[course.level] ?? course.level}</span></div><div className="flex flex-1 flex-col p-5"><h3 className="text-lg font-black leading-8">{course.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-7 text-[#5f7168]">{course.description}</p><dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-[#5f7168]">مدرس</dt><dd className="mt-1 font-bold">{course.instructorName ?? "در حال انتخاب"}</dd></div><div><dt className="text-[#5f7168]">شروع</dt><dd className="mt-1 font-bold">{formatPersianDate(course.startsOn)}</dd></div><div><dt className="text-[#5f7168]">جلسه</dt><dd className="mt-1 font-bold">{course.sessions.toLocaleString("fa-IR")}</dd></div><div><dt className="text-[#5f7168]">ظرفیت باقی‌مانده</dt><dd className="mt-1 font-bold">{left ? `${left.toLocaleString("fa-IR")} نفر` : "تکمیل"}</dd></div></dl><div className="mt-auto flex items-center justify-between gap-2 border-t border-[#e2e5df] pt-4 text-sm"><span className="font-bold tabular-nums">{formatPrice(course.price)}</span><Link href={`/classes/${course.slug}`} className="ui-button !min-h-11 !px-4 !text-xs">جزئیات دوره</Link></div></div></article>;
}
export function WorkshopCard({ workshop }: { workshop: WorkshopCardData }) {
  return <article className="ui-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-4"><span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[#e3f0e9] text-[#2f4a3a]"><Icon name="calendar" className="h-5 w-5" /></span><div><h3 className="font-black">{workshop.title}</h3><p className="mt-1 text-sm text-[#5f7168]">{formatPersianDate(workshop.startsOn)} · {workshop.instructorName ?? "مدرس دوره"}</p><p className="mt-1 text-xs text-[#5f7168]">{workshop.location} · {Math.max(0, workshop.capacity - workshop.seatsTaken).toLocaleString("fa-IR")} صندلی</p></div></div><div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end"><span className="text-sm font-bold">{formatPrice(workshop.price)}</span><Link href={`/classes/${workshop.slug}`} className="ui-button ui-button-quiet !min-h-11 !px-4 !text-xs">مشاهده</Link></div></article>;
}

export type OnlineCourseCardData = {
  slug: string; title: string; summary: string; level: string; price: number;
  capacity: number; seatsTaken: number; posterUrl: string | null; teaserVideoUrl: string | null;
  lessonCount: number; totalMinutes: number; ratingAvg: number | null; ratingCount: number;
};

/** Card for the «دوره‌های آنلاین» track — poster (or teaser frame), duration,
 *  seats and the moderated rating, linking into the course page. */
export function OnlineCourseCard({ course }: { course: OnlineCourseCardData }) {
  const unlimited = course.capacity === 0;
  const left = unlimited ? null : Math.max(0, course.capacity - course.seatsTaken);
  return <article className="ui-card flex h-full flex-col overflow-hidden">
    <div className="relative aspect-[16/9] bg-[#1f2e27]">
      {course.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={course.posterUrl} alt="" className="h-full w-full object-cover" />
      ) : course.teaserVideoUrl ? (
         
        <video src={course.teaserVideoUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-2xl font-black text-white/60">FARSHID</span>
      )}
      <span className="absolute right-4 top-4 ui-pill ui-tag-academy bg-white/85">{LEVEL[course.level] ?? course.level}</span>
      {left !== null && (
        <span className={`absolute left-4 top-4 ui-pill ${left === 0 ? "bg-[#f7f0d8] text-[#6b5213]" : "bg-white/85 text-[#2f4a3a]"}`}>
          {left === 0 ? "تکمیل ظرفیت" : `${left.toLocaleString("fa-IR")} ظرفیت`}
        </span>
      )}
    </div>
    <div className="flex flex-1 flex-col p-5">
      <h3 className="text-lg font-black leading-8">{course.title}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-7 text-[#5f7168]">{course.summary}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-[#5f7168]">درس</dt><dd className="mt-1 font-bold">{course.lessonCount.toLocaleString("fa-IR")} ویدیو</dd></div>
        <div><dt className="text-[#5f7168]">زمان کل</dt><dd className="mt-1 font-bold tabular-nums">{course.totalMinutes ? `${Math.round(course.totalMinutes / 60)} ساعت` : "—"}</dd></div>
        <div><dt className="text-[#5f7168]">امتیاز</dt><dd className="mt-1 font-bold tabular-nums">{course.ratingAvg !== null ? `${course.ratingAvg.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ★ (${course.ratingCount.toLocaleString("fa-IR")})` : "نو"}</dd></div>
      </dl>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#e2e5df] pt-4 text-sm">
        <span className="font-bold tabular-nums">{course.price === 0 ? "رایگان" : formatPrice(course.price)}</span>
        <Link href={`/courses/${course.slug}`} className="ui-button !min-h-11 !px-4 !text-xs">صفحه دوره</Link>
      </div>
    </div>
  </article>;
}
