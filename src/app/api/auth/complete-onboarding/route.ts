import { NextResponse } from "next/server";
import { z } from "zod";
import { completeOtpOnboarding } from "@/lib/auth-otp";
import { rateLimit } from "@/lib/rate-limit";

const Schema = z.object({
  phone: z.string().min(10).max(20),
  code: z.string().min(6).max(10),
  name: z.string().min(2).max(80),
});

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "اطلاعات نامعتبر است." }, { status: 400 });
  const phone = parsed.data.phone;
  if (!rateLimit(`onboard:${phone}`, 5, 60_000))
    return NextResponse.json({ error: "تلاش‌های بیش از حد مجاز است." }, { status: 429 });
  try {
    const result = await completeOtpOnboarding(phone, parsed.data.code, parsed.data.name);
    if (!result.ok || !result.user)
      return NextResponse.json({ error: result.error ?? "ورود انجام نشد." }, { status: 400 });
    return NextResponse.json(
      { ok: true, user: result.user, isFirstTime: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "ورود انجام نشد. دوباره تلاش کنید." }, { status: 503 });
  }
}
