import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingPolicyAcceptance, otps, userRoles, users } from "@/db/schema";
import { setSessionCookie } from "@/lib/session";
import { sessionSigningSecret } from "@/lib/server-secret";
import { demoPhones, isOtpDemoMode } from "@/lib/preview";

export const POLICY_CURRENT_VERSION = process.env.BOOKING_POLICY_VERSION?.trim() || "1.0";

export function normalizeIranianMobile(input: string): string | null {
  const digits = input.trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\s\-()]/g, "");
  let phone = digits;
  if (phone.startsWith("+98")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("0098")) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith("98")) phone = `0${phone.slice(2)}`;
  else if (phone.startsWith("9") && phone.length === 10) phone = `0${phone}`;
  return /^09\d{9}$/.test(phone) ? phone : null;
}

/** Preview accounts only. Remove OTP_DEMO_MODE and configure the delivery webhook in a real deployment. */
export function isDemoPhone(phone: string): boolean {
  return isOtpDemoMode() && demoPhones().includes(phone);
}

async function codeDigest(phone: string, code: string): Promise<string> {
  return createHmac("sha256", await sessionSigningSecret()).update(`otp:${phone}:${code}`).digest("hex");
}

/**
 * Preview-only fixed code. When OTP delivery is not configured (no SMS
 * webhook), any phone can sign in with this code so the booking flow can be
 * exercised end to end. In production this returns null and only the delivered
 * random code is accepted.
 */
export function previewFixedCode(): string | null {
  return isOtpDemoMode() ? "123456" : null;
}

export async function createOtpCode(phone: string): Promise<{ code: string; expiresAt: Date }> {
  const fixed = previewFixedCode();
  const code = fixed ?? String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 2 * 60_000);
  await db.transaction(async (tx) => {
    // Only the latest code can be used; invalidates every prior request immediately.
    await tx.delete(otps).where(eq(otps.phone, phone));
    await tx.insert(otps).values({ phone, code: await codeDigest(phone, code), expiresAt });
  });
  return { code, expiresAt };
}

export async function deliverOtp(phone: string, code: string): Promise<boolean> {
  // Preview mode: the fixed code is shown in the UI, so no SMS is required.
  if (previewFixedCode()) return true;
  if (isDemoPhone(phone)) return true;
  const endpoint = process.env.OTP_SMS_WEBHOOK_URL;
  const token = process.env.OTP_SMS_WEBHOOK_TOKEN;
  if (!endpoint || !token) return false;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone, message: `کد ورود شما به آکادمی زیبایی فرشید معروف پور: ${code}` }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function findValidOtp(phone: string, code: string): Promise<{ ok: true; otpId: number } | { ok: false; error: string }> {
  const normalized = normalizeIranianMobile(phone);
  const cleanCode = code.trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  if (!normalized || !/^\d{6}$/.test(cleanCode))
    return { ok: false, error: "کد تأیید باید ۶ رقم باشد." };

  // Preview shortcut: a fixed code works for any phone while delivery is off.
  if (previewFixedCode() === cleanCode) {
    await db.insert(users).values({ phone: normalized, name: "", role: "CLIENT" })
      .onConflictDoNothing({ target: users.phone });
    return { ok: true, otpId: 0 };
  }

  const [latest] = await db.select().from(otps)
    .where(eq(otps.phone, normalized)).orderBy(desc(otps.createdAt), desc(otps.id)).limit(1);
  if (!latest || latest.usedAt || latest.expiresAt <= new Date())
    return { ok: false, error: "کد تأیید منقضی شده است. کد تازه بگیرید." };
  if (latest.attempts >= 5)
    return { ok: false, error: "تعداد تلاش‌ها بیش از حد مجاز است. کد تازه بگیرید." };

  const expected = await codeDigest(normalized, cleanCode);
  if (!/^[a-f0-9]{64}$/.test(latest.code) || !timingSafeEqual(Buffer.from(expected), Buffer.from(latest.code))) {
    await db.update(otps).set({ attempts: sql`${otps.attempts} + 1` })
      .where(and(eq(otps.id, latest.id), isNull(otps.usedAt), lt(otps.attempts, 5)));
    return { ok: false, error: "کد واردشده صحیح نیست." };
  }
  return { ok: true, otpId: latest.id };
}

/** Atomic one-time consume; only the first caller wins. */
async function consumeOtp(otpId: number): Promise<boolean> {
  if (otpId <= 0) return true; // preview fixed code, nothing to consume
  const [claimed] = await db.update(otps).set({ usedAt: new Date() })
    .where(and(eq(otps.id, otpId), isNull(otps.usedAt)))
    .returning({ id: otps.id });
  return Boolean(claimed);
}

async function getUserOrCreate(phone: string, name?: string) {
  const nameClean = name?.trim() ?? "";
  await db.insert(users).values({ phone, name: nameClean, role: "CLIENT" }).onConflictDoNothing({ target: users.phone });
  if (nameClean) {
    await db.update(users).set({ name: nameClean })
      .where(and(eq(users.phone, phone), sql`length(trim(name)) = 0`));
  }
  const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return user ?? null;
}

type OtpResult = {
  ok: boolean;
  error?: string;
  user?: { id: number; name: string; phone: string; role: string; roles: string[] };
  isFirstTime?: boolean;
};

/** Multi-role payload for the client; permissions themselves never leave the server. */
async function otpUserPayload(userId: number, row: { id: number; name: string; phone: string; role: string }) {
  const memberships = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    roles: memberships.length ? memberships.map((m) => m.role) : [row.role],
  };
}

/**
 * Validates the OTP. For a returning user it consumes the code and starts the
 * session. For a first-time user it validates WITHOUT consuming or starting a
 * session — the name step finalizes onboarding via completeOtpOnboarding, so the
 * login never depends on a cookie set by a separate request.
 */
export async function verifyOtpCode(phone: string, code: string): Promise<OtpResult> {
  const check = await findValidOtp(phone, code);
  if (!check.ok) return { ok: false, error: check.error };
  const normalized = normalizeIranianMobile(phone)!;
  const user = await getUserOrCreate(normalized);
  if (!user) return { ok: false, error: "ورود انجام نشد. دوباره تلاش کنید." };
  if (isDemoPhone(normalized) && user.role !== "CLIENT")
    return { ok: false, error: "برای حساب کارکنان از بخش ورود کارکنان استفاده کنید." };
  if (!user.name.trim()) return { ok: true, isFirstTime: true };

  const consumed = await consumeOtp(check.otpId);
  if (!consumed) return { ok: false, error: "این کد قبلاً استفاده شده است." };
  await setSessionCookie(user.id);
  return { ok: true, isFirstTime: false, user: await otpUserPayload(user.id, user) };
}

/**
 * First-time onboarding: re-validates the (still unconsumed) OTP, stores the
 * chosen name, consumes the code and starts the session in a single request.
 */
export async function completeOtpOnboarding(phone: string, code: string, name: string): Promise<OtpResult> {
  const check = await findValidOtp(phone, code);
  if (!check.ok) return { ok: false, error: check.error };
  const normalized = normalizeIranianMobile(phone)!;
  const nameClean = name.trim();
  if (!nameClean) return { ok: false, error: "نام واردشده معتبر نیست." };
  const user = await getUserOrCreate(normalized, nameClean);
  if (!user) return { ok: false, error: "ورود انجام نشد." };
  if (isDemoPhone(normalized) && user.role !== "CLIENT")
    return { ok: false, error: "برای حساب کارکنان از بخش ورود کارکنان استفاده کنید." };
  const consumed = await consumeOtp(check.otpId);
  if (!consumed) return { ok: false, error: "این کد قبلاً استفاده شده است." };
  await setSessionCookie(user.id);
  return { ok: true, isFirstTime: false, user: await otpUserPayload(user.id, user) };
}

/**
 * Guest checkout identity: a customer who reached the pay step with a name and
 * a phone gets an account WITHOUT an OTP round-trip (the code belongs to the
 * returning-customer path). Never escalates: staff or non-CLIENT accounts are
 * not touched, an empty profile left by a half-finished onboarding may be
 * completed. Returns `existing` when the phone already belongs to a named
 * account — the UI then routes the person to the OTP login instead.
 */
export async function startGuestCheckoutSession(
  phone: string,
  name: string,
): Promise<{ ok: boolean; error?: string; existing?: boolean; user?: { id: number; name: string; phone: string; role: string } }> {
  const normalized = normalizeIranianMobile(phone);
  if (!normalized) return { ok: false, error: "شماره موبایل معتبر نیست." };
  const nameClean = name.trim();
  if (nameClean.length < 2) return { ok: false, error: "نام کامل را وارد کنید." };

  // Staff/ops numbers are protected by role, not by the demo block (customer
  // demo numbers must keep working): a non-CLIENT row is never claimed here.
  const [before] = await db.select().from(users).where(eq(users.phone, normalized)).limit(1);
  if (before) {
    if (before.role !== "CLIENT")
      return { ok: false, error: "این شماره حساب غیرمشتری است؛ با پشتیبانی سالن تماس بگیرید." };
    // Named account already on this phone? The guest path must NOT log anyone
    // in without the code — route the visitor to the OTP login instead.
    if (before.name.trim()) return { ok: true, existing: true };
  }

  const user = await getUserOrCreate(normalized, nameClean);
  if (!user) return { ok: false, error: "ساخت حساب کاربری انجام نشد. دوباره تلاش کنید." };
  if (isDemoPhone(normalized) && user.role !== "CLIENT")
    return { ok: false, error: "برای حساب کارکنان از بخش ورود کارکنان استفاده کنید." };
  await setSessionCookie(user.id);
  return { ok: true, user: { id: user.id, name: user.name, phone: user.phone, role: user.role } };
}

export async function hasAcceptedPolicy(userId: number, version = POLICY_CURRENT_VERSION): Promise<boolean> {
  const [row] = await db.select({ id: bookingPolicyAcceptance.id }).from(bookingPolicyAcceptance)
    .where(and(eq(bookingPolicyAcceptance.userId, userId), eq(bookingPolicyAcceptance.policyVersion, version))).limit(1);
  return Boolean(row);
}

export async function recordPolicyAcceptance(userId: number, version = POLICY_CURRENT_VERSION): Promise<void> {
  if (version !== POLICY_CURRENT_VERSION) throw new Error("POLICY_VERSION_MISMATCH");
  await db.insert(bookingPolicyAcceptance).values({ userId, policyVersion: version })
    .onConflictDoNothing({ target: [bookingPolicyAcceptance.userId, bookingPolicyAcceptance.policyVersion] });
}
