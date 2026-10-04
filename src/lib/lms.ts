/**
 * Online-course domain rules (دوره‌های آنلاین). Everything a customer can do
 * goes through here so the same checks hold for the HTTP routes and any later
 * admin tooling: capacity is grabbed atomically, payments are only issued for
 * published priced courses, progress and reviews require an active seat.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courseEnrollments, courseLessons, courseReviews, courses, notifications, payments } from "@/db/schema";

export const CourseEnrollSchema = z.object({
  courseId: z.coerce.number().int().positive(),
});

export const CourseProgressSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  lessonId: z.coerce.number().int().positive(),
  completed: z.boolean(),
});

export const CourseReviewSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(600).default(""),
});

export type EnrollOutcome =
  | { ok: true; enrollmentId: number; status: string; paymentReference: string | null }
  | { ok: false; error: string; code?: "ALREADY" };

/** Seat + enrollment + (when priced) a payment row, in one transaction. */
export async function enrollCourse(userId: number, courseId: number): Promise<EnrollOutcome> {
  try {
    return await db.transaction(async (tx) => {
      // Row lock first: two students can't take the last seat together.
      const [course] = await tx
        .select()
        .from(courses)
        .where(eq(courses.id, courseId))
        .for("update")
        .limit(1);
      if (!course || course.status !== "PUBLISHED")
        return { ok: false as const, error: "این دوره در حال ثبت‌نام نیست." };

      const [existing] = await tx
        .select()
        .from(courseEnrollments)
        .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, userId)))
        .limit(1);
      if (existing && (existing.status === "ACTIVE" || existing.status === "COMPLETED"))
        return { ok: false as const, error: "شما قبلاً در این دوره ثبت‌نام کرده‌اید.", code: "ALREADY" };
      if (existing && existing.status === "PENDING") {
        // An unpaid seat already waits for its payment: reuse it and its link.
        const [row] = await tx
          .select({ reference: payments.reference })
          .from(payments)
          .where(and(eq(payments.kind, "COURSE"), eq(payments.refId, existing.id), eq(payments.status, "PENDING")))
          .limit(1);
        return { ok: true as const, enrollmentId: existing.id, status: "PENDING", paymentReference: row?.reference ?? null };
      }

      if (course.capacity > 0) {
        const grabbed = await tx
          .update(courses)
          .set({ seatsTaken: sql`${courses.seatsTaken} + 1` })
          .where(and(eq(courses.id, courseId), sql`${courses.capacity} > ${courses.seatsTaken}`))
          .returning({ id: courses.id });
        if (grabbed.length === 0) return { ok: false as const, error: "ظرفیت این دوره تکمیل شده است." };
      }

      const [enrollment] = await tx
        .insert(courseEnrollments)
        .values({ courseId, userId, status: course.price > 0 ? "PENDING" : "ACTIVE" })
        .returning();
      if (!enrollment) return { ok: false as const, error: "ثبت‌نام انجام نشد." };

      let paymentReference: string | null = null;
      if (course.price > 0) {
        paymentReference = `CR-${enrollment.id}-${randomUUID()}`;
        await tx.insert(payments).values({
          kind: "COURSE",
          refId: enrollment.id,
          amount: course.price,
          status: "PENDING",
          reference: paymentReference,
        });
      }

      await tx.insert(notifications).values({
        targetRole: "SUPER_ADMIN",
        kind: "COURSE_REGISTRATION",
        title: `ثبت‌نام دورهٔ آنلاین: ${course.title}`,
        body: `user:${userId}`,
      });

      return {
        ok: true as const,
        enrollmentId: enrollment.id,
        status: enrollment.status,
        paymentReference,
      };
    });
  } catch {
    return { ok: false as const, error: "ثبت‌نام انجام نشد. دوباره تلاش کنید." };
  }
}

/** Watch-progress; completing the last lesson closes the enrollment. */
export async function setCourseProgress(
  userId: number,
  input: z.infer<typeof CourseProgressSchema>,
): Promise<{ ok: true; completedLessonIds: number[]; totalLessons: number; status: string } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const [enrollment] = await tx
      .select()
      .from(courseEnrollments)
      .where(and(eq(courseEnrollments.courseId, input.courseId), eq(courseEnrollments.userId, userId)))
      .limit(1);
    if (!enrollment || enrollment.status === "PENDING" || enrollment.status === "CANCELLED")
      return { ok: false as const, error: "اول باید در دوره ثبت‌نام کنید." };
    const [lesson] = await tx
      .select({ id: courseLessons.id })
      .from(courseLessons)
      .where(and(eq(courseLessons.id, input.lessonId), eq(courseLessons.courseId, input.courseId)))
      .limit(1);
    if (!lesson) return { ok: false as const, error: "درس یافت نشد." };

    let done: number[] = [];
    try {
      const parsed: unknown = JSON.parse(enrollment.completedLessonIds);
      if (Array.isArray(parsed)) done = parsed.filter((x): x is number => typeof x === "number");
    } catch {
      done = [];
    }
    if (input.completed && !done.includes(lesson.id)) done = [...done, lesson.id];
    if (!input.completed) done = done.filter((id) => id !== lesson.id);

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(courseLessons)
      .where(eq(courseLessons.courseId, input.courseId));
    const finished = count > 0 && done.length >= count;
    const nextStatus = enrollment.status === "COMPLETED" ? "COMPLETED" : finished ? "COMPLETED" : "ACTIVE";
    await tx
      .update(courseEnrollments)
      .set({ completedLessonIds: JSON.stringify(done), status: nextStatus, updatedAt: new Date() })
      .where(eq(courseEnrollments.id, enrollment.id));
    return { ok: true as const, completedLessonIds: done, totalLessons: count, status: nextStatus };
  });
}

/** Reviews only from seated students; they wait for admin approval. */
export async function upsertCourseReview(
  userId: number,
  userName: string,
  input: z.infer<typeof CourseReviewSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [enrollment] = await db
    .select({ status: courseEnrollments.status })
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.courseId, input.courseId), eq(courseEnrollments.userId, userId)))
    .limit(1);
  if (!enrollment || enrollment.status === "PENDING" || enrollment.status === "CANCELLED")
    return { ok: false as const, error: "نظر فقط برای شرکت‌کنندگان دوره ثبت می‌شود." };
  await db
    .insert(courseReviews)
    .values({ courseId: input.courseId, userId, rating: input.rating, comment: input.comment, status: "PENDING" })
    .onConflictDoUpdate({
      target: [courseReviews.courseId, courseReviews.userId],
      set: { rating: input.rating, comment: input.comment, status: "PENDING", createdAt: new Date() },
    });
  void userName;
  return { ok: true as const };
}
