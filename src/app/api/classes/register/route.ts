import { NextResponse } from "next/server";
import { ClassRegistrationSchema, registerForClass } from "@/lib/booking";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !user.name.trim()) return NextResponse.json({ error: "برای ثبت‌نام ابتدا با شماره موبایل وارد شوید." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = ClassRegistrationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "اطلاعات نامعتبر است." }, { status: 400 });
  if (parsed.data.studentPhone !== user.phone || parsed.data.studentName !== user.name)
    return NextResponse.json({ error: "اطلاعات ثبت‌نام باید با حساب واردشده یکسان باشد." }, { status: 403 });
  if (!rateLimit(`class:${user.id}`, 5, 60_000)) return NextResponse.json({ error: "درخواست‌های مکرر؛ یک دقیقه صبر کنید." }, { status: 429 });
  const result = await registerForClass(parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
}
