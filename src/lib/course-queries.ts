/** Read models for the online-courses vertical (public pages, learn area, admin). */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { barbers, courseEnrollments, courseLessons, courseReviews, courseSections, courses, users } from "@/db/schema";

export type CourseCard = {
  slug: string;
  title: string;
  summary: string;
  level: string;
  price: number;
  capacity: number;
  seatsTaken: number;
  posterUrl: string | null;
  teaserVideoUrl: string | null;
  lessonCount: number;
  totalMinutes: number;
  ratingAvg: number | null;
  ratingCount: number;
};

export async function getPublishedCourses(): Promise<CourseCard[]> {
  const rows = await db
    .select({
      slug: courses.slug,
      title: courses.title,
      summary: courses.summary,
      level: courses.level,
      price: courses.price,
      capacity: courses.capacity,
      seatsTaken: courses.seatsTaken,
      posterUrl: courses.posterUrl,
      teaserVideoUrl: courses.teaserVideoUrl,
      lessonCount: sql<number>`(select count(*)::int from course_lessons cl where cl.course_id = courses.id)`,
      totalMinutes: sql<number>`(select coalesce(sum(cl.duration_min),0)::int from course_lessons cl where cl.course_id = courses.id)`,
      ratingAvg: sql<number | null>`(select round(avg(cr.rating)::numeric,2) from course_reviews cr where cr.course_id = courses.id and cr.status = 'APPROVED')`,
      ratingCount: sql<number>`(select count(*)::int from course_reviews cr where cr.course_id = courses.id and cr.status = 'APPROVED')`,
    })
    .from(courses)
    .where(eq(courses.status, "PUBLISHED"))
    .orderBy(desc(courses.publishedAt), courses.id);
  return rows.map((r) => ({ ...r, ratingAvg: r.ratingAvg === null ? null : Number(r.ratingAvg) }));
}

export type CoursePageData = {
  course: typeof courses.$inferSelect;
  instructorName: string | null;
  sections: { id: number; title: string; lessons: (typeof courseLessons.$inferSelect)[] }[];
  reviews: { id: number; name: string; rating: number; comment: string; createdAt: Date }[];
  ratingAvg: number | null;
  ratingCount: number;
};

export async function getCoursePage(slug: string): Promise<CoursePageData | null> {
  const [course] = await db.select().from(courses).where(eq(courses.slug, slug)).limit(1);
  if (!course) return null;
  const [instructor] = course.instructorBarberId
    ? await db.select({ name: barbers.name }).from(barbers).where(eq(barbers.id, course.instructorBarberId)).limit(1)
    : [undefined];
  const [sectionsRaw, lessons, reviewsRaw, agg] = await Promise.all([
    db.select().from(courseSections).where(eq(courseSections.courseId, course.id)).orderBy(courseSections.position, courseSections.id),
    db.select().from(courseLessons).where(eq(courseLessons.courseId, course.id)).orderBy(courseLessons.position, courseLessons.id),
    db
      .select({ id: courseReviews.id, name: users.name, rating: courseReviews.rating, comment: courseReviews.comment, createdAt: courseReviews.createdAt })
      .from(courseReviews)
      .innerJoin(users, eq(users.id, courseReviews.userId))
      .where(and(eq(courseReviews.courseId, course.id), eq(courseReviews.status, "APPROVED")))
      .orderBy(desc(courseReviews.createdAt))
      .limit(20),
    db
      .select({ avg: sql<number | null>`round(avg(${courseReviews.rating})::numeric,2)`, count: sql<number>`count(*)::int` })
      .from(courseReviews)
      .where(and(eq(courseReviews.courseId, course.id), eq(courseReviews.status, "APPROVED")))
      .limit(1),
  ]);
  const bySection = new Map<number | null, typeof lessons>();
  for (const lesson of lessons) {
    const key = lesson.sectionId;
    bySection.set(key, [...(bySection.get(key) ?? []), lesson]);
  }
  return {
    course,
    instructorName: instructor?.name ?? null,
    sections: [
      ...sectionsRaw.map((section) => ({ id: section.id, title: section.title, lessons: bySection.get(section.id) ?? [] })),
      ...(bySection.get(null)?.length
        ? [{ id: -1, title: "بدون سرفصل", lessons: bySection.get(null) ?? [] }]
        : []),
    ],
    reviews: reviewsRaw,
    ratingAvg: agg[0]?.avg === null || agg[0]?.avg === undefined ? null : Number(agg[0].avg),
    ratingCount: agg[0]?.count ?? 0,
  };
}

export type LearnData = {
  course: typeof courses.$inferSelect;
  enrollment: typeof courseEnrollments.$inferSelect;
  groups: { title: string; lessons: (typeof courseLessons.$inferSelect & { completed: boolean })[] }[];
  completedIds: number[];
};

export async function getLearnData(userId: number, slug: string): Promise<LearnData | null> {
  const [course] = await db.select().from(courses).where(eq(courses.slug, slug)).limit(1);
  if (!course) return null;
  const [enrollment] = await db
    .select()
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.courseId, course.id), eq(courseEnrollments.userId, userId)))
    .limit(1);
  if (!enrollment || enrollment.status === "PENDING" || enrollment.status === "CANCELLED") return null;
  const [sectionsRaw, lessons] = await Promise.all([
    db.select().from(courseSections).where(eq(courseSections.courseId, course.id)).orderBy(courseSections.position, courseSections.id),
    db.select().from(courseLessons).where(eq(courseLessons.courseId, course.id)).orderBy(courseLessons.position, courseLessons.id),
  ]);
  let completedIds: number[] = [];
  try {
    const parsed: unknown = JSON.parse(enrollment.completedLessonIds);
    if (Array.isArray(parsed)) completedIds = parsed.filter((x): x is number => typeof x === "number");
  } catch {
    completedIds = [];
  }
  const done = new Set(completedIds);
  const bySection = new Map<number | null, (typeof lessons)[number][]>();
  for (const lesson of lessons) {
    bySection.set(lesson.sectionId, [...(bySection.get(lesson.sectionId) ?? []), lesson]);
  }
  return {
    course,
    enrollment,
    completedIds,
    groups: [
      ...sectionsRaw.map((section) => ({
        title: section.title,
        lessons: (bySection.get(section.id) ?? []).map((l) => ({ ...l, completed: done.has(l.id) })),
      })),
      ...(bySection.get(null)?.length
        ? [{ title: "بدون سرفصل", lessons: (bySection.get(null) ?? []).map((l) => ({ ...l, completed: done.has(l.id) })) }]
        : []),
    ],
  };
}

export async function getUserCourseEnrollments(userId: number) {
  return db
    .select({
      id: courseEnrollments.id,
      status: courseEnrollments.status,
      grade: courseEnrollments.grade,
      resultNote: courseEnrollments.resultNote,
      completedLessonIds: courseEnrollments.completedLessonIds,
      updatedAt: courseEnrollments.updatedAt,
      slug: courses.slug,
      title: courses.title,
      price: courses.price,
      totalLessons: sql<number>`(select count(*)::int from course_lessons cl where cl.course_id = courses.id)`,
      paymentReference: sql<string | null>`(select p.reference from payments p where p.kind = 'COURSE' and p.ref_id = course_enrollments.id and p.status = 'PENDING' limit 1)`,
    })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
    .where(eq(courseEnrollments.userId, userId))
    .orderBy(desc(courseEnrollments.updatedAt));
}

/* ---------- admin ---------- */

export async function getCourseAdminData(courseIds: number[]) {
  if (courseIds.length === 0) return { enrollments: [], reviews: [], sections: [], lessons: [] };
  const [enrollments, reviews, sections, lessons] = await Promise.all([
    db
      .select({
        id: courseEnrollments.id,
        courseId: courseEnrollments.courseId,
        userId: courseEnrollments.userId,
        status: courseEnrollments.status,
        grade: courseEnrollments.grade,
        resultNote: courseEnrollments.resultNote,
        name: users.name,
        phone: users.phone,
      })
      .from(courseEnrollments)
      .innerJoin(users, eq(users.id, courseEnrollments.userId))
      .where(inArray(courseEnrollments.courseId, courseIds))
      .orderBy(desc(courseEnrollments.updatedAt)),
    db
      .select({
        id: courseReviews.id,
        courseId: courseReviews.courseId,
        rating: courseReviews.rating,
        comment: courseReviews.comment,
        status: courseReviews.status,
        name: users.name,
        createdAt: courseReviews.createdAt,
      })
      .from(courseReviews)
      .innerJoin(users, eq(users.id, courseReviews.userId))
      .where(inArray(courseReviews.courseId, courseIds))
      .orderBy(desc(courseReviews.createdAt)),
    db.select().from(courseSections).where(inArray(courseSections.courseId, courseIds)).orderBy(courseSections.position, courseSections.id),
    db.select().from(courseLessons).where(inArray(courseLessons.courseId, courseIds)).orderBy(courseLessons.position, courseLessons.id),
  ]);
  return { enrollments, reviews, sections, lessons };
}
