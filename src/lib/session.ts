import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sessionSigningSecret } from "@/lib/server-secret";
import { db } from "@/db";
import { users, barbers } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Role = "SUPER_ADMIN" | "RECEPTIONIST" | "BARBER" | "CLIENT";

export type SessionUser = {
  id: number;
  name: string;
  phone: string;
  role: Role;
  barberId: number | null;
};

const COOKIE = "salon_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;

async function sign(value: string): Promise<string> {
  return createHmac("sha256", await sessionSigningSecret()).update(value).digest("hex");
}

export async function createToken(userId: number): Promise<string> {
  const payload = `${userId}:${Math.floor(Date.now() / 1000) + SESSION_AGE_SECONDS}`;
  return `${payload}.${await sign(payload)}`;
}

async function verifyToken(token: string): Promise<number | null> {
  const separator = token.lastIndexOf(".");
  if (separator < 0) return null;
  const payload = token.slice(0, separator);
  const mac = token.slice(separator + 1);
  if (!/^[a-f0-9]{64}$/.test(mac)) return null;
  const expected = await sign(payload);
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const [rawId, rawExpiry] = payload.split(":");
  const id = Number(rawId);
  const expiry = Number(rawExpiry);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(expiry) || expiry <= Date.now() / 1000) return null;
  return id;
}

export async function setSessionCookie(userId: number) {
  const store = await cookies();
  store.set(COOKIE, await createToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const userId = await verifyToken(token);
  if (!userId) return null;
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return null;
  let barberId: number | null = null;
  if (row.role === "BARBER") {
    const [b] = await db.select().from(barbers).where(eq(barbers.userId, row.id)).limit(1);
    barberId = b?.id ?? null;
  }
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role as Role,
    barberId,
  };
}

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export function isStaff(role: Role) {
  return role === "SUPER_ADMIN" || role === "RECEPTIONIST";
}

/** Panel a signed-in account lands on after login. */
export function landingPathFor(role: Role): string {
  if (role === "BARBER") return "/barber";
  return isStaff(role) ? "/admin" : "/account";
}

