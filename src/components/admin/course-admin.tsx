import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { barbers, courses } from "@/db/schema";
import { getCourseAdminData } from "@/lib/course-queries";
import { ActionForm, Field } from "@/components/action-form";
import { UploadButton } from "@/components/admin/upload-button";
import {
  addCourseLessonAction,
  addCourseSectionAction,
  createCourseAction,
  deleteCourseLessonAction,
  setCourseReviewStatusAction,
  setCourseStatusAction,
  setEnrollmentResultAction,
  updateCourseAction,
} from "@/lib/actions/courses";

const STATUS_FA: Record<string, string> = { DRAFT: "پیش‌نمایش", PUBLISHED: "منتشرشده", ARCHIVED: "بایگانی" };
const ENROLL_FA: Record<string, string> = { PENDING: "در انتظار پرداخت", ACTIVE: "فعال", COMPLETED: "کامل‌شده", CANCELLED: "لغوشده" };
const LEVEL_FA: Record<string, string> = { BEGINNER: "مقدماتی", INTERMEDIATE: "میانی", ADVANCED: "پیشرفته" };
const selectCls = "focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-semibold";

function UrlField({ id, label, name, defaultValue }: { id: string; label: string; name: string; defaultValue: string | null }) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-semibold text-bone/65">{label}</label>
      <input
        id={id}
        name={name}
        dir="ltr"
        defaultValue={defaultValue ?? ""}
        className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-medium"
      />
    </div>
  );
}

/** Full admin surface for the online-courses vertical. */
export async function CourseAdminPanel() {
  const courseRows = await db
    .select({
      course: courses,
      instructorName: barbers.name,
      lessonCount: sql<number>`(select count(*)::int from course_lessons cl where cl.course_id = courses.id)`,
      sectionCount: sql<number>`(select count(*)::int from course_sections cs where cs.course_id = courses.id)`,
      enrollCount: sql<number>`(select count(*)::int from course_enrollments ce where ce.course_id = courses.id and ce.status in ('PENDING','ACTIVE','COMPLETED'))`,
      pendingReviews: sql<number>`(select count(*)::int from course_reviews cr where cr.course_id = courses.id and cr.status = 'PENDING')`,
    })
    .from(courses)
    .leftJoin(barbers, eq(barbers.id, courses.instructorBarberId))
    .orderBy(desc(courses.id));
  const barberOptions = await db.select({ id: barbers.id, name: barbers.name }).from(barbers).where(eq(barbers.active, true));
  const details = await getCourseAdminData(courseRows.map((r) => r.course.id));

  return (
    <div className="space-y-8" data-course-admin="">
      <ul className="divide-y divide-[#c59b4b]/15 rounded-2xl border border-[#c59b4b]/20 bg-white/70 text-sm">
        {courseRows.length === 0 && <li className="p-4 text-xs text-bone/60">هنوز دوره آنلاینی ساخته نشده — از فرم پایین شروع کنید.</li>}
        {courseRows.map(({ course, instructorName, lessonCount, sectionCount, enrollCount, pendingReviews }) => (
          <li key={course.id} className="p-3">
            <details className="group" data-course-row={course.slug}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-xl px-1 py-1 hover:bg-white">
                <span className="font-bold text-bone">
                  {course.title}
                  <span className={`me-2 rounded-full px-2 py-0.5 text-[10px] font-black ${course.status === "PUBLISHED" ? "bg-[#e3f0e9] text-[#0f5a3b]" : course.status === "DRAFT" ? "bg-[#f7f0d8] text-[#6b5213]" : "bg-bone/10 text-bone/50"}`}>
                    {STATUS_FA[course.status] ?? course.status}
                  </span>
                </span>
                <span className="text-[11px] text-bone/60">
                  {sectionCount.toLocaleString("fa-IR")} سرفصل · {lessonCount.toLocaleString("fa-IR")} درس · {enrollCount.toLocaleString("fa-IR")} ثبت‌نام
                  {pendingReviews > 0 && <b className="me-2 text-[#855e16]">{pendingReviews.toLocaleString("fa-IR")} نظر در انتظار تأیید</b>}
                </span>
              </summary>

              <div className="mt-3 grid gap-5 rounded-2xl border border-[#c59b4b]/20 bg-white/80 p-4">
                {/* editor ------------------------------------------------ */}
                <section>
                  <h4 className="text-xs font-black text-[#0f5a3b]">ویرایش اطلاعات دوره</h4>
                  <ActionForm action={updateCourseAction} submitLabel="ذخیره تغییرات" className="mt-2">
                    <input type="hidden" name="id" value={course.id} />
                    <input type="hidden" name="slug" value={course.slug} />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="عنوان" name="title" defaultValue={course.title} />
                      <Field label="خلاصه یک‌پاراگرافی" name="summary" defaultValue={course.summary} required={false} />
                      <div>
                        <label className="text-[11px] font-semibold text-bone/65" htmlFor={`level-${course.id}`}>سطح</label>
                        <select id={`level-${course.id}`} name="level" className={selectCls} defaultValue={course.level}>
                          <option value="BEGINNER">مقدماتی</option>
                          <option value="INTERMEDIATE">میانی</option>
                          <option value="ADVANCED">پیشرفته</option>
                        </select>
                      </div>
                      <Field label="شهریه (تومان، ۰ = رایگان)" name="price" type="number" defaultValue={course.price} />
                      <Field label="ظرفیت (۰ = نامحدود)" name="capacity" type="number" defaultValue={course.capacity} />
                      <div>
                        <label className="text-[11px] font-semibold text-bone/65" htmlFor={`instr-${course.id}`}>مدرس</label>
                        <select id={`instr-${course.id}`} name="instructorBarberId" className={selectCls} defaultValue={course.instructorBarberId ?? ""}>
                          <option value="">— انتخاب نشده —</option>
                          {barberOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div>
                        <UrlField id={`f-teaser-${course.id}`} label="آدرس ویدیوی تیزر" name="teaserVideoUrl" defaultValue={course.teaserVideoUrl} />
                        <div className="mt-1.5"><UploadButton targetId={`f-teaser-${course.id}`} label="آپلود تیزر" accept="video/mp4,video/webm,video/quicktime" /></div>
                      </div>
                      <div>
                        <UrlField id={`f-poster-${course.id}`} label="آدرس تصویر پوستر" name="posterUrl" defaultValue={course.posterUrl} />
                        <div className="mt-1.5"><UploadButton targetId={`f-poster-${course.id}`} label="آپلود پوستر" accept="image/jpeg,image/png,image/webp,image/avif" /></div>
                      </div>
                      <Field label="توضیحات کامل (خط‌جدید مجاز)" name="description" defaultValue={course.description} required={false} />
                      <Field label="خروجی‌های دوره (هر خط یک مهارت)" name="outcomes" defaultValue={course.outcomes} required={false} />
                    </div>
                  </ActionForm>
                </section>

                {/* status ------------------------------------------------ */}
                <section className="flex flex-wrap items-center gap-3">
                  <ActionForm action={setCourseStatusAction} submitLabel={course.status === "PUBLISHED" ? "بازگشت به پیش‌نمایش" : "انتشار دوره"}>
                    <input type="hidden" name="id" value={course.id} />
                    <input type="hidden" name="slug" value={course.slug} />
                    <input type="hidden" name="status" value={course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"} />
                  </ActionForm>
                  {course.status !== "ARCHIVED" && (
                    <ActionForm action={setCourseStatusAction} submitLabel="بایگانی دوره">
                      <input type="hidden" name="id" value={course.id} />
                      <input type="hidden" name="slug" value={course.slug} />
                      <input type="hidden" name="status" value="ARCHIVED" />
                    </ActionForm>
                  )}
                  <span className="text-[11px] text-bone/50">وضعیت: {STATUS_FA[course.status]} · سطح: {LEVEL_FA[course.level] ?? course.level}{instructorName ? ` · مدرس: ${instructorName}` : ""}</span>
                </section>

                {/* syllabus ---------------------------------------------- */}
                <section className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-black text-[#0f5a3b]">سرفصل‌ها</h4>
                    <ul className="mt-2 space-y-1 text-xs">
                      {details.sections.filter((s) => s.courseId === course.id).map((s) => (
                        <li key={s.id} className="rounded-lg bg-white p-2 font-semibold text-bone">{s.position.toLocaleString("fa-IR")}. {s.title}</li>
                      ))}
                      {details.sections.filter((s) => s.courseId === course.id).length === 0 && <li className="text-bone/50">سرفصلی ندارد.</li>}
                    </ul>
                    <ActionForm action={addCourseSectionAction} submitLabel="افزودن سرفصل" className="mt-2">
                      <input type="hidden" name="courseId" value={course.id} />
                      <input type="hidden" name="slug" value={course.slug} />
                      <Field label="عنوان سرفصل جدید" name="title" />
                    </ActionForm>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-[#0f5a3b]">درس‌ها و ویدیوها</h4>
                    <ul className="mt-2 space-y-1 text-xs">
                      {details.lessons.filter((l) => l.courseId === course.id).map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2">
                          <span className="min-w-0 truncate font-semibold text-bone">
                            {l.position.toLocaleString("fa-IR")}. {l.title}
                            {l.freePreview && <b className="me-1.5 text-[10px] text-[#855e16]">نمونه رایگان</b>}
                            {l.videoUrl === null && <b className="me-1.5 text-[10px] text-rose-600">بدون ویدیو</b>}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-bone/55">
                            {l.durationMin > 0 && <span className="tabular-nums">{l.durationMin} دقیقه</span>}
                            <ActionForm action={deleteCourseLessonAction} submitLabel="حذف">
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="slug" value={course.slug} />
                            </ActionForm>
                          </span>
                        </li>
                      ))}
                      {details.lessons.filter((l) => l.courseId === course.id).length === 0 && <li className="text-bone/50">هنوز درسی اضافه نشده.</li>}
                    </ul>
                    <ActionForm action={addCourseLessonAction} submitLabel="افزودن درس" className="mt-2">
                      <input type="hidden" name="courseId" value={course.id} />
                      <input type="hidden" name="slug" value={course.slug} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="عنوان درس" name="title" />
                        <div>
                          <label className="text-[11px] font-semibold text-bone/65" htmlFor={`sec-${course.id}`}>سرفصل</label>
                          <select id={`sec-${course.id}`} name="sectionId" className={selectCls} defaultValue="">
                            <option value="">— بدون سرفصل —</option>
                            {details.sections.filter((s) => s.courseId === course.id).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                          </select>
                        </div>
                        <div>
                          <UrlField id={`f-video-${course.id}`} label="آدرس ویدیوی درس" name="videoUrl" defaultValue={null} />
                          <div className="mt-1.5"><UploadButton targetId={`f-video-${course.id}`} label="آپلود ویدیوی درس" accept="video/mp4,video/webm,video/quicktime" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="مدت (دقیقه)" name="durationMin" type="number" defaultValue={0} required={false} />
                          <div>
                            <label className="text-[11px] font-semibold text-bone/65" htmlFor={`prev-${course.id}`}>نمونه رایگان؟</label>
                            <select id={`prev-${course.id}`} name="freePreview" className={selectCls} defaultValue="off">
                              <option value="off">نه — فقط دانشجو</option>
                              <option value="on">بله — برای همه</option>
                            </select>
                          </div>
                        </div>
                        <Field label="یادداشت درس (اختیاری)" name="notes" required={false} />
                      </div>
                    </ActionForm>
                  </div>
                </section>

                {/* students + reviews -------------------------------------*/}
                <section className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-black text-[#0f5a3b]">دانشجوها — وضعیت و نتیجه</h4>
                    <ul className="mt-2 space-y-2 text-xs">
                      {details.enrollments.filter((e) => e.courseId === course.id).map((e) => (
                        <li key={e.id} className="rounded-xl border border-[#c59b4b]/20 bg-white p-3" data-enrollment-row={e.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-bone">{e.name} <span dir="ltr" className="font-mono text-bone/50">{e.phone}</span></span>
                            <span className="rounded-full bg-[#e3f0e9] px-2 py-0.5 text-[10px] font-black text-[#0f5a3b]">
                              {ENROLL_FA[e.status] ?? e.status}{e.grade !== null ? ` · نمره ${(e.grade / 5).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} از ۲۰` : ""}
                            </span>
                          </div>
                          <ActionForm action={setEnrollmentResultAction} submitLabel="ذخیره نتیجه" className="mt-2">
                            <input type="hidden" name="enrollmentId" value={e.id} />
                            <input type="hidden" name="slug" value={course.slug} />
                            <div className="grid gap-2 sm:grid-cols-3">
                              <div>
                                <label className="text-[10px] font-semibold text-bone/65" htmlFor={`st-${e.id}`}>وضعیت</label>
                                <select id={`st-${e.id}`} name="status" className={selectCls} defaultValue={e.status === "PENDING" ? "ACTIVE" : e.status}>
                                  <option value="ACTIVE">فعال</option>
                                  <option value="COMPLETED">کامل‌شده</option>
                                  <option value="CANCELLED">لغو (آزادسازی صندلی)</option>
                                </select>
                              </div>
                              <Field label="نمره از ۱۰۰" name="grade" type="number" defaultValue={e.grade ?? undefined} required={false} />
                              <Field label="بازخورد دانشجو" name="resultNote" defaultValue={e.resultNote} required={false} />
                            </div>
                          </ActionForm>
                        </li>
                      ))}
                      {details.enrollments.filter((e) => e.courseId === course.id).length === 0 && <li className="text-bone/50">ثبت‌نامی نیست.</li>}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-[#0f5a3b]">نظرات</h4>
                    <ul className="mt-2 space-y-2 text-xs">
                      {details.reviews.filter((r) => r.courseId === course.id).map((r) => (
                        <li key={r.id} className="rounded-xl border border-[#c59b4b]/20 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-bone">{r.name} — <span dir="ltr" className="text-[#c59b4b]">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span></span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${r.status === "PENDING" ? "bg-[#f7f0d8] text-[#6b5213]" : r.status === "APPROVED" ? "bg-[#e3f0e9] text-[#0f5a3b]" : "bg-bone/10 text-bone/50"}`}>
                              {r.status === "PENDING" ? "در انتظار" : r.status === "APPROVED" ? "منتشرشده" : "پنهان"}
                            </span>
                          </div>
                          {r.comment && <p className="mt-1.5 leading-6 text-bone/70">{r.comment}</p>}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(["APPROVED", "HIDDEN", "PENDING"] as const).filter((t) => t !== r.status).map((target) => (
                              <ActionForm action={setCourseReviewStatusAction} key={target} submitLabel={target === "APPROVED" ? "تأیید و نمایش" : target === "HIDDEN" ? "پنهان" : "بازگشت به صف"}>
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="slug" value={course.slug} />
                                <input type="hidden" name="status" value={target} />
                              </ActionForm>
                            ))}
                          </div>
                        </li>
                      ))}
                      {details.reviews.filter((r) => r.courseId === course.id).length === 0 && <li className="text-bone/50">نظری ثبت نشده.</li>}
                    </ul>
                  </div>
                </section>
              </div>
            </details>
          </li>
        ))}
      </ul>

      {/* create ----------------------------------------------------------- */}
      <div className="rounded-2xl border border-[#c59b4b]/30 bg-white/80 p-5">
        <h3 className="text-sm font-bold text-[#0f5a3b]">ساخت دوره آنلاین جدید</h3>
        <p className="mt-1 text-[11px] leading-6 text-bone/55">دوره اول «پیش‌نمایش» ساخته می‌شود؛ تا منتشر نشود برای مشتریان دیده نمی‌شود و پیش از انتشار حداقل یک درس لازم است.</p>
        <ActionForm action={createCourseAction} submitLabel="ساخت دوره" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="عنوان" name="title" />
            <Field label="slug (لاتین، یکتا)" name="slug" dir="ltr" />
            <div>
              <label className="text-[11px] font-semibold text-bone/65" htmlFor="new-level">سطح</label>
              <select id="new-level" name="level" className={selectCls} defaultValue="BEGINNER">
                <option value="BEGINNER">مقدماتی</option>
                <option value="INTERMEDIATE">میانی</option>
                <option value="ADVANCED">پیشرفته</option>
              </select>
            </div>
            <Field label="شهریه (تومان، ۰ = رایگان)" name="price" type="number" defaultValue={0} />
            <Field label="ظرفیت (۰ = نامحدود)" name="capacity" type="number" defaultValue={30} />
            <div>
              <label className="text-[11px] font-semibold text-bone/65" htmlFor="new-instr">مدرس</label>
              <select id="new-instr" name="instructorBarberId" className={selectCls} defaultValue="">
                <option value="">— بعداً —</option>
                {barberOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
