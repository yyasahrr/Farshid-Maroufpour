import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeIranianMobile, verifyOtpCode } from "@/lib/auth-otp";
import { rateLimit } from "@/lib/rate-limit";

const VerifyOtpSchema = z.object({ phone: z.string().min(10).max(20), code: z.string().min(6).max(10) });

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = VerifyOtpSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "اطلاعات واردشده نامعتبر است." }, { status: 400 });
  const phone = normalizeIranianMobile(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: "شماره موبایل واردشده معتبر نیست." }, { status: 400 });
  if (!rateLimit(`otp-verify:${phone}`, 10, 60_000)) {
    return NextResponse.json({ error: "تلاش‌های بیش از حد. کمی بعد تلاش کنید." }, { status: 429 });
  }
  try {
    const result = await verifyOtpCode(phone, parsed.data.code);
    if (!result.ok) return NextResponse.json({ error: result.error ?? "کد واردشده صحیح نیست." }, { status: 400 });
    return NextResponse.json({ ok: true, user: result.user, isFirstTime: result.isFirstTime }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "تأیید کد انجام نشد. دوباره تلاش کنید." }, { status: 503 });
  }
}
