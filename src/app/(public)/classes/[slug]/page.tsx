import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { barbers, classes } from "@/db/schema";
import { ClassRegisterForm } from "@/components/class-register-form";
import { Badge } from "@/components/ui-cards";
import { Icon } from "@/components/icons";
import { getCurrentUser } from "@/lib/session";
import { formatPersianDate, formatPrice, todayISO } from "@/lib/time";
import { demoPhoneHint } from "@/lib/preview";

export const dynamic = "force-dynamic";
const levels: Record<string, string> = { BEGINNER: "مقدماتی", INTERMEDIATE: "متوسط", ADVANCED: "پیشرفته" };
export default async function ClassDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [row, user] = await Promise.all([
    db.select({ course: classes, instructor: barbers.name, instructorSlug: barbers.slug }).from(classes)
      .leftJoin(barbers, eq(barbers.id, classes.instructorBarberId)).where(eq(classes.slug, slug)).limit(1),
    getCurrentUser(),
  ]);
  const data = row[0];
  if (!data) notFound();
  const course = data.course;
  const free = Math.max(0, course.capacity - course.seatsTaken);
  const unavailable = course.status !== "OPEN" || free < 1 || course.startsOn < todayISO();
  const outcomes = course.outcomes.split("\n").map((line) => line.trim()).filter(Boolean);
  return <div className="ui-shell"><div className="ui-container ui-page max-w-[1100px]">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Course", name: course.title, description: course.description, provider: { "@type": "Organization", name: "آکادمی زیبایی فرشید معروف پور" } }) }} />
    <nav aria-label="مسیر" className="mb-5 flex items-center gap-2 text-sm text-bone-500"><Link className="ui-link" href="/academy">آکادمی</Link><span>/</span>{course.title}</nav>
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"><div>
      <Badge tone="brand">{levels[course.level] ?? course.level}</Badge><h1 className="mt-3 text-[clamp(28px,4vw,40px)] leading-[1.5] font-black">{course.title}</h1><p className="mt-4 max-w-2xl text-sm leading-8 text-bone-500">{course.description}</p>
      <dl className="mt-7 grid gap-3 sm:grid-cols-2"><div className="ui-card flex items-start gap-3 p-4"><Icon name="user" className="h-5 w-5 text-brass-800" /><div><dt className="text-xs text-bone-500">مدرس</dt><dd className="mt-1 font-bold">{data.instructorSlug ? <Link className="ui-link !text-base" href={`/barbers/${data.instructorSlug}`}>{data.instructor}</Link> : "در حال انتخاب"}</dd></div></div><div className="ui-card flex items-start gap-3 p-4"><Icon name="calendar" className="h-5 w-5 text-brass-800" /><div><dt className="text-xs text-bone-500">شروع</dt><dd className="mt-1 font-bold">{formatPersianDate(course.startsOn)}</dd></div></div><div className="ui-card flex items-start gap-3 p-4"><Icon name="location" className="h-5 w-5 text-brass-800" /><div><dt className="text-xs text-bone-500">محل</dt><dd className="mt-1 font-bold">{course.location}</dd></div></div><div className="ui-card flex items-start gap-3 p-4"><Icon name="cap" className="h-5 w-5 text-brass-800" /><div><dt className="text-xs text-bone-500">جلسه</dt><dd className="mt-1 font-bold">{course.sessions.toLocaleString("fa-IR")} جلسه</dd></div></div></dl>
      {outcomes.length > 0 && <section className="mt-10"><h2 className="text-xl font-black">سرفصل‌ها و مهارت‌ها</h2><ul className="mt-4 space-y-2">{outcomes.map((item) => <li key={item} className="ui-card flex items-start gap-3 p-4 text-sm leading-7"><Icon name="check" className="mt-1 h-5 w-5 shrink-0 text-brand-400" />{item}</li>)}</ul></section>}
      <div className="mt-9 rounded-2xl bg-brand-50 p-5 text-sm leading-8 text-brand-400">برنامه دقیق جلسه‌ها و جزئیات آموزشی پس از ثبت‌نام از طریق پذیرش آکادمی در اختیار شما قرار می‌گیرد.</div>
    </div><aside className="ui-panel lg:sticky lg:top-24"><p className="text-sm text-bone-500">شهریه دوره</p><p className="mt-1 text-2xl font-black tabular-nums">{formatPrice(course.price)}</p><p className="mt-3 text-sm text-brass-800">{unavailable ? "ثبت‌نام بسته است" : `${free.toLocaleString("fa-IR")} جای خالی از ${course.capacity.toLocaleString("fa-IR")}`}</p><div className="ui-rule my-5" /><ClassRegisterForm classId={course.id} unavailable={unavailable} initialUser={user ? { id: user.id, name: user.name, phone: user.phone, role: user.role } : null} demoPhoneHint={demoPhoneHint()} /></aside></div>
  </div></div>;
}
