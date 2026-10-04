import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";
import { CourseProgressSchema, setCourseProgress } from "@/lib/lms";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ابتدا وارد شوید." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = CourseProgressSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "اطلاعات نامعتبر است." }, { status: 400 });
  if (!rateLimit(`course-progress:${user.id}`, 60, 60_000))
    return NextResponse.json({ error: "درخواست‌های مکرر." }, { status: 429 });
  const result = await setCourseProgress(user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
