import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";
import { CourseReviewSchema, upsertCourseReview } from "@/lib/lms";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "برای ثبت نظر وارد شوید." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = CourseReviewSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "اطلاعات نامعتبر است." }, { status: 400 });
  if (!rateLimit(`course-review:${user.id}`, 4, 60_000))
    return NextResponse.json({ error: "درخواست‌های مکرر؛ یک دقیقه صبر کنید." }, { status: 429 });
  const result = await upsertCourseReview(user.id, user.name, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true, message: "نظر شما ثبت شد و پس از تأیید نمایش داده می‌شود." }, { status: 201 });
}
