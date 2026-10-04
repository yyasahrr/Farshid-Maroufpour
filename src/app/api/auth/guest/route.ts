/**
 * POST /api/auth/guest — instant checkout account.
 *
 * The booking wizard asks for identity only at the review step, right before
 * payment (design law: login belongs to the commit point). A brand-new phone
 * with a full name gets a CLIENT account and a session here — no OTP, no
 * detour. Phones that already own a named account get { existing: true } so
 * the UI can route the visitor to the SMS-code login instead of silently
 * signing them in or duplicating the registration.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { startGuestCheckoutSession } from "@/lib/auth-otp";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";

const Schema = z.object({
  phone: z.string().min(10).max(20),
  name: z.string().trim().min(2).max(80),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "نام و شماره موبایل معتبر نیست." }, { status: 400 });
  if (!rateLimit(`guest:${parsed.data.phone}`, 6, 60_000))
    return NextResponse.json({ error: "تلاش‌های بیش از حد مجاز است؛ یک دقیقه صبر کنید." }, { status: 429 });
  try {
    const result = await startGuestCheckoutSession(parsed.data.phone, parsed.data.name);
    if (!result.ok) return NextResponse.json({ error: result.error ?? "ساخت حساب انجام نشد." }, { status: 400 });
    return NextResponse.json(
      result.existing ? { ok: true, existing: true } : { ok: true, existing: false, user: result.user },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "ساخت حساب انجام نشد. دوباره تلاش کنید." }, { status: 503 });
  }
}
