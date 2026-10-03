import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtpCode, deliverOtp, normalizeIranianMobile, previewFixedCode } from "@/lib/auth-otp";
import { rateLimit } from "@/lib/rate-limit";

const SendOtpSchema = z.object({ phone: z.string().min(10).max(20) });

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = SendOtpSchema.safeParse(body);
  const phone = parsed.success ? normalizeIranianMobile(parsed.data.phone) : null;
  if (!phone) return NextResponse.json({ error: "شماره موبایل واردشده معتبر نیست." }, { status: 400 });
  if (!rateLimit(`otp-send:${phone}`, 3, 60_000)) {
    return NextResponse.json({ error: "درخواست‌های مکرر. یک دقیقه صبر کنید." }, { status: 429 });
  }
  if (!previewFixedCode() && !(process.env.OTP_SMS_WEBHOOK_URL && process.env.OTP_SMS_WEBHOOK_TOKEN)) {
    return NextResponse.json({ error: "ارسال پیامک برای این شماره فعال نیست." }, { status: 503 });
  }
  try {
    const { code, expiresAt } = await createOtpCode(phone);
    if (!(await deliverOtp(phone, code))) {
      return NextResponse.json({ error: "ارسال پیامک انجام نشد. دوباره تلاش کنید." }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      phone,
      expiresAt: expiresAt.toISOString(),
      ...(previewFixedCode() ? { devCode: code } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ارسال کد انجام نشد. دوباره تلاش کنید." }, { status: 503 });
  }
}
