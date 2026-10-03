import { NextResponse } from "next/server";
import { CreateAppointmentSchema, createAppointment } from "@/lib/booking";
import { hasAcceptedPolicy } from "@/lib/auth-otp";
import { getCurrentUser, isStaff } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "برای رزرو ابتدا با شماره موبایل وارد شوید." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = CreateAppointmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "اطلاعات نامعتبر است." }, { status: 400 });

  const staff = user ? isStaff(user) : false;
  if (!staff && parsed.data.source !== "ONLINE") return NextResponse.json({ error: "دسترسی غیرمجاز است." }, { status: 403 });
  if (user && !staff && (parsed.data.clientPhone !== user.phone || parsed.data.clientName !== user.name || !user.name.trim()))
    return NextResponse.json({ error: "اطلاعات رزرو باید با حساب واردشده مطابقت داشته باشد." }, { status: 403 });
  if (user && !staff && !(await hasAcceptedPolicy(user.id)))
    return NextResponse.json({ error: "لطفاً پیش از ثبت، قوانین رزرو را تأیید کنید." }, { status: 403 });
  const limitKey = `appointment:${user.id}`;
  if (!rateLimit(limitKey, staff ? 60 : 6, 60_000))
    return NextResponse.json({ error: "درخواست‌های بیش از حد؛ یک دقیقه صبر کنید." }, { status: 429 });

  const actor = `user:${user.id}`;
  const result = await createAppointment(parsed.data, actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
}
