"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clearSessionCookie, landingPathFor, loadSessionUser, setSessionCookie } from "@/lib/session";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/passwords";
import { rateLimit } from "@/lib/rate-limit";

const LoginSchema = z.object({
  phone: z.string().trim().min(4).max(20),
  password: z.string().min(4).max(100),
});

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const parsed = LoginSchema.safeParse({
    phone: formData.get("phone"),
    password: formData.get("password"),
  });
  if (!parsed.success) return "اطلاعات ورود نامعتبر است.";
  if (!rateLimit(`login:${parsed.data.phone}`, 8, 60_000)) {
    return "تلاش‌های بیش از حد. یک دقیقه صبر کنید.";
  }

  const [user] = await db.select().from(users).where(eq(users.phone, parsed.data.phone)).limit(1);
  if (!user || !verifyPassword(user.passwordHash, parsed.data.password)) {
    return "شماره یا رمز عبور اشتباه است.";
  }
  // Rows created before the scrypt helper existed are upgraded on the next sign-in.
  if (needsRehash(user.passwordHash)) {
    await db.update(users).set({ passwordHash: hashPassword(parsed.data.password) }).where(eq(users.id, user.id));
  }
  await setSessionCookie(user.id);
  const sessionUser = await loadSessionUser(user.id);
  redirect(sessionUser ? landingPathFor(sessionUser) : "/");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/");
}
