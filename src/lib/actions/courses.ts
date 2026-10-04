"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  courseEnrollments,
  courseLessons,
  courseReviews,
  courseSections,
  courses,
  siteSettings,
} from "@/db/schema";
import { getCurrentUser, type SessionUser } from "@/lib/session";
import type { Permission } from "@/lib/rbac";
import { CONTACT_SETTING_KEY } from "@/lib/site-settings";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

async function requirePermission(permission: Permission): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has(permission)) return null;
  return user;
}

async function audit(actor: string, action: string, target: string) {
  await db.insert(auditLogs).values({ actor, action, target });
}

function revalidateCourse(slug: string) {
  revalidatePath("/admin");
  revalidatePath("/academy");
  revalidatePath(`/courses/${slug}`);
  revalidatePath(`/courses/${slug}/learn`);
  revalidatePath("/account");
}

/* ---------- course CRUD ---------- */

const CourseFields = z.object({
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9-]+$/, "فقط حروف کوچک، عدد و خط تیره"),
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().max(280).default(""),
  description: z.string().trim().max(8000).default(""),
  outcomes: z.string().trim().max(2000).default(""),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).default("BEGINNER"),
  price: z.coerce.number().int().min(0).max(500_000_000).default(0),
  capacity: z.coerce.number().int().min(0).max(10000).default(0),
  instructorBarberId: z.coerce.number().int().positive().optional().nullable(),
  teaserVideoUrl: z.string().trim().max(300).optional().nullable(),
  posterUrl: z.string().trim().max(300).optional().nullable(),
});

const empty = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

export async function createCourseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requirePermission("academy:manage");
  if (!staff) return fail("دسترسی غیرمجاز.");
  const parsed = CourseFields.safeParse({
    ...Object.fromEntries(formData),
    instructorBarberId: empty(formData.get("instructorBarberId") as string) ?? undefined,
    teaserVideoUrl: empty(formData.get("teaserVideoUrl") as string),
    posterUrl: empty(formData.get("posterUrl") as string),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  try {
    await db.insert(courses).values({ ...parsed.data, status: "DRAFT" });
  } catch {
    return fail("شناسه (slug) دوره تکراری است.");
  }
  await audit(`user:${staff.id}`, "COURSE_CREATED", parsed.data.slug);
  revalidatePath("/admin");
  revalidatePath("/academy");
  return ok("دوره ساخته شد — فعلاً پیش‌نمایش است؛ پس از افزودن درس‌ها منتشرش کنید.");
}

const CourseUpdateSchema = z.object({ id: z.coerce.number().int().positive(), slug: z.string().trim() });

export async function updateCourseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requirePermission("academy:manage");
  if (!staff) return fail("دسترسی غیرمجاز.");
  const meta = CourseUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!meta.success) return fail("داده نامعتبر است.");
  const fields = CourseFields.safeParse({
    ...Object.fromEntries(formData),
    instructorBarberId: empty(formData.get("instructorBarberId") as string) ?? undefined,
    teaserVideoUrl: empty(formData.get("teaserVideoUrl") as string),
    posterUrl: empty(formData.get("posterUrl") as string),
  });
  if (!fields.success) return fail(fields.error.issues[0].message);
  const [current] = await db.select().from(courses).where(eq(courses.id, meta.data.id)).limit(1);
  if (!current) return fail("دوره یافت نشد.");
  const capacity = fields.data.capacity;
  if (capacity !== 0 && capacity < current.seatsTaken)
    return fail("ظرفیت نمی‌تواند از تعداد ثبت‌نام‌های قطعی کمتر باشد.");
  await db
    .update(courses)
    .set({
      title: fields.data.title,
      summary: fields.data.summary,
      description: fields.data.description,
      outcomes: fields.data.outcomes,
      level: fields.data.level,
      price: fields.data.price,
      capacity,
      instructorBarberId: fields.data.instructorBarberId ?? null,
      teaserVideoUrl: fields.data.teaserVideoUrl ?? null,
      posterUrl: fields.data.posterUrl ?? null,
    })
    .where(eq(courses.id, meta.data.id));
  await audit(`user:${staff.id}`, "COURSE_UPDATED", current.slug);
  revalidateCourse(current.slug);
  return ok("تغییرات ذخیره شد.");
}

const CourseStatusSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  slug: z.string().trim(),
});

export async function setCourseStatusAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requirePermission("academy:manage");
  if (!staff) return fail("دسترسی غیرمجاز.");
  const parsed = CourseStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("داده نامعتبر است.");
  const [course] = await db.select().from(courses).where(eq(courses.id, parsed.data.id)).limit(1);
  if (!course) return fail("دوره یافت نشد.");
  if (parsed.data.status === "PUBLISHED") {
    const [lessonCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(courseLessons)
      .where(eq(courseLessons.courseId, course.id))
      .limit(1);
    if (!lessonCount || lessonCount.count === 0)
      return fail("قبل از انتشار، حداقل یک درس با ویدیو برای دوره تعریف کنید.");
  }
  await db
    .update(courses)
    .set({
      status: parsed.data.status,
      publishedAt: parsed.data.status === "PUBLISHED" ? course.publishedAt ?? new Date() : course.publishedAt,
    })
    .where(eq(courses.id, course.id));
  await audit(`user:${staff.id}`, "COURSE_STATUS", `${course.slug}:${parsed.data.status}`);
  revalidateCourse(course.slug);
  return ok(
    parsed.data.status === "PUBLISHED"
      ? "دوره منتشر شد و در صفحه آکادمی نمایش داده می‌شود."
      : parsed.data.status === "DRAFT"
        ? "دوره به پیش‌نمایش رفت."
        : "دوره بایگانی شد.",
  );
}

/* ---------- sections & lessons (سرفصل و درس) ---------- */

const SectionSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  title: z.string().trim().min(2).max(120),
  slug: z.string().trim(),
});

export async function addCourseSectionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requirePermission("academy:manage");
  if (!staff) return fail("دسترسی غیرمجاز.");
  const parsed = SectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("داده نامعتبر است.");
  const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, parsed.data.courseId)).limit(1);
  if (!course) return fail("دوره یافت نشد.");
  const [{ max }] = await db
    .select({ max: courseSections.position })
    .from(courseSections)
    .where(eq(courseSections.courseId, course.id))
    .orderBy(courseSections.position)
    .limit(1)
    .then((rows) => (rows.length ? rows : [{ max: -1 }]));
  await db.insert(courseSections).values({ courseId: course.id, title: parsed.data.title, position: (max ?? 0) + 1 });
  await audit(`user:${staff.id}`, "COURSE_SECTION_ADDED", parsed.data.slug);
  revalidateCourse(parsed.data.slug);
  return ok("سرفصل افزوده شد.");
}

const LessonSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  sectionId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().trim().min(2).max(160),
  videoUrl: z.string().trim().max(300).optional().nullable(),
  durationMin: z.coerce.number().int().min(0).max(600).default(0),
  freePreview: z.enum(["on", "true", "1", "off"]).default("off"),
  notes: z.string().trim().max(2000).default(""),
  slug: z.string().trim(),
});

export async function addCourseLessonAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requirePermission("academy:manage");
  if (!staff) return fail("دسترسی غیرمجاز.");
  const parsed = LessonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, parsed.data.courseId)).limit(1);
  if (!course) return fail("دوره یافت نشد.");
  const [{ max }] = await db
    .select({ max: courseLessons.position })
    .from(courseLessons)
    .where(eq(courseLessons.courseId, course.id))
    .orderBy(courseLessons.position)
    .limit(1)
    .then((rows) => (rows.length ? rows : [{ max: -1 }]));
  const sectionId = parsed.data.sectionId ?? null;
  if (sectionId !== null) {
    const [sec] = await db
      .select({ id: courseSections.id })
      .from(courseSections)
      .where(and(eq(courseSections.id, sectionId), eq(courseSections.courseId, course.id)))
      .limit(1);
    if (!sec) return fail("سرفصل انتخابی به این دوره ربطی ندارد.");
  }
  await db.insert(courseLessons).values({
    courseId: course.id,
    sectionId,
    title: parsed.data.title,
    videoUrl: parsed.data.videoUrl && parsed.data.videoUrl.trim() ? parsed.data.videoUrl.trim() : null,
    durationMin: parsed.data.durationMin,
    position: (max ?? 0) + 1,
    freePreview: parsed.data.freePreview !== "off",
    notes: parsed.data.notes,
  });
  await audit(`user:${staff.id}`, "COURSE_LESSON_ADDED", parsed.data.slug);
  revalidateCourse(parsed.data.slug);
  return ok("درس افزوده شد.");
}

const LessonDeleteSchema = z.object({ id: z.coerce.number().int().positive(), slug: z.string().trim() });

export async function deleteCourseLessonAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requirePermission("academy:manage");
  if (!staff) return fail("دسترسی غیرمجاز.");
  const parsed = LessonDeleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("داده نامعتبر است.");
  await db.delete(courseLessons).where(eq(courseLessons.id, parsed.data.id));
  await audit(`user:${staff.id}`, "COURSE_LESSON_DELETED", parsed.data.slug);
  revalidateCourse(parsed.data.slug);
  return ok("درس حذف شد.");
}

/* ---------- enrollments: grading & results ---------- */

const ResultSchema = z.object({
  enrollmentId: z.coerce.number().int().positive(),
  grade: z.coerce.number().int().min(0).max(100).optional().nullable(),
  resultNote: z.string().trim().max(500).default(""),
  status: z.enum(["PENDING", "ACTIVE", "COMPLETED", "CANCELLED"]).default("ACTIVE"),
  slug: z.string().trim(),
});

export async function setEnrollmentResultAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requirePermission("academy:manage");
  if (!staff) return fail("دسترسی غیرمجاز.");
  const parsed = ResultSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const [enrollment] = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.id, parsed.data.enrollmentId))
    .limit(1);
  if (!enrollment) return fail("ثبت‌نام یافت نشد.");
  const grade = parsed.data.grade ?? null;
  if (enrollment.status === "CANCELLED" && parsed.data.status !== "CANCELLED") {
    // re-activating must respect capacity
    const [course] = await db.select().from(courses).where(eq(courses.id, enrollment.courseId)).limit(1);
    if (course && course.capacity > 0 && course.seatsTaken >= course.capacity && parsed.data.status !== "PENDING")
      return fail("ظرفیت دوره تکمیل است؛ اول ظرفیت را افزایش دهید.");
    if (course) await db.update(courses).set({ seatsTaken: course.seatsTaken + 1 }).where(eq(courses.id, course.id));
  }
  if (enrollment.status !== "CANCELLED" && parsed.data.status === "CANCELLED") {
    // the student gives the seat back so somebody else can take it
    await db
      .update(courses)
      .set({ seatsTaken: sql`GREATEST(${courses.seatsTaken} - 1, 0)` })
      .where(eq(courses.id, enrollment.courseId));
  }
  await db
    .update(courseEnrollments)
    .set({
      status: parsed.data.status,
      grade: grade === null ? null : Math.round((grade / 100) * 20 * 100) / 100,
      resultNote: parsed.data.resultNote,
      updatedAt: new Date(),
    })
    .where(eq(courseEnrollments.id, parsed.data.enrollmentId));
  await audit(`user:${staff.id}`, "COURSE_ENROLLMENT_UPDATED", `${parsed.data.slug}#${parsed.data.enrollmentId}`);
  revalidateCourse(parsed.data.slug);
  return ok("وضعیت و نتیجهٔ دانشجو ذخیره شد.");
}

/* ---------- review moderation ---------- */

const ReviewStatusSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["APPROVED", "HIDDEN", "PENDING"]),
  slug: z.string().trim(),
});

export async function setCourseReviewStatusAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requirePermission("academy:manage");
  if (!staff) return fail("دسترسی غیرمجاز.");
  const parsed = ReviewStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("داده نامعتبر است.");
  const [review] = await db.select().from(courseReviews).where(eq(courseReviews.id, parsed.data.id)).limit(1);
  if (!review) return fail("نظر یافت نشد.");
  await db.update(courseReviews).set({ status: parsed.data.status }).where(eq(courseReviews.id, review.id));
  await audit(`user:${staff.id}`, "COURSE_REVIEW_MODERATED", `${review.id}:${parsed.data.status}`);
  revalidateCourse(parsed.data.slug);
  return ok("نظر به‌روزرسانی شد.");
}

/* ---------- site contact (address + Neshan coordinates) ---------- */

const ContactSchema = z.object({
  address: z.string().trim().min(4).max(240),
  lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lng: z.coerce.number().min(-180).max(180).optional().nullable(),
});

export async function setSiteContactAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requirePermission("settings:manage");
  if (!staff) return fail("دسترسی غیرمجاز.");
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const parsed = ContactSchema.safeParse({
    address: formData.get("address"),
    lat: latRaw === null || String(latRaw).trim() === "" ? null : Number(String(latRaw).replace("٫", ".")),
    lng: lngRaw === null || String(lngRaw).trim() === "" ? null : Number(String(lngRaw).replace("٫", ".")),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if ((parsed.data.lat === null) !== (parsed.data.lng === null))
    return fail("برای موقعیت نقشه هم عرض و هم طول جغرافیایی لازم است.");
  const value = JSON.stringify({
    address: parsed.data.address,
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
  });
  await db
    .insert(siteSettings)
    .values({ key: CONTACT_SETTING_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
  await audit(`user:${staff.id}`, "SITE_CONTACT_UPDATED", "site_settings:contact");
  revalidatePath("/home");
  revalidatePath("/");
  revalidatePath("/admin");
  return ok("آدرس ذخیره شد و در سایت نمایش داده می‌شود.");
}
