import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { POLICY_CURRENT_VERSION, recordPolicyAcceptance } from "@/lib/auth-otp";
import { isSameOriginRequest } from "@/lib/same-origin";

const PolicyRequest = z.object({ version: z.literal(POLICY_CURRENT_VERSION) });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "برای ادامه وارد حساب شوید." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!PolicyRequest.safeParse(body).success)
    return NextResponse.json({ error: "نسخه قوانین تغییر کرده است. صفحه را تازه‌سازی کنید." }, { status: 409 });
  try {
    await recordPolicyAcceptance(user.id);
    return NextResponse.json({ ok: true, version: POLICY_CURRENT_VERSION }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ثبت تأیید قوانین انجام نشد. دوباره تلاش کنید." }, { status: 503 });
  }
}
