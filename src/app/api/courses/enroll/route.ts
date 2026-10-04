import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";
import { CourseEnrollSchema, enrollCourse } from "@/lib/lms";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  const user = await getCurrentUser();
  // logged-in students never see another login step: the seat binds to the
  // session account directly. Guests get a clear single ask instead.
  if (!user)
    return NextResponse.json(
      { error: "برای ثبت‌نام در دوره وارد حساب خود شوید.", code: "LOGIN_REQUIRED" },
      { status: 401 },
    );
  const body: unknown = await request.json().catch(() => null);
  const parsed = CourseEnrollSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "اطلاعات نامعتبر است." }, { status: 400 });
  if (!rateLimit(`course-enroll:${user.id}`, 6, 60_000))
    return NextResponse.json({ error: "درخواست‌های مکرر؛ یک دقیقه صبر کنید." }, { status: 429 });
  const result = await enrollCourse(user.id, parsed.data.courseId);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.code === "ALREADY" ? 200 : 409 },
    );
  return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
}
