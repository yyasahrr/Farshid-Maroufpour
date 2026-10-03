import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sessionSigningSecret } from "@/lib/server-secret";
import { db } from "@/db";
import { users, barbers, userRoles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { Permission, Role, permissionsForRoles, rolesFromLegacyRole } from "@/lib/rbac";

export type { Role };

export type SessionUser = {
  id: number;
  name: string;
  phone: string;
  /** Legacy primary role kept only for display fallbacks. */
  role: Role;
  /** Multi-role membership — the authorization source of truth. */
  roles: Role[];
  permissions: Set<Permission>;
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
  return loadSessionUser(userId);
}

export async function loadSessionUser(userId: number): Promise<SessionUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return null;
  const memberships = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, row.id));
  // A user without an explicit membership row falls back to the legacy column.
  const roles = memberships.length
    ? [...new Set(memberships.map((m) => m.role as Role))]
    : rolesFromLegacyRole(row.role);
  const hasBarberRole =
    roles.includes("BARBER") || roles.includes("INSTRUCTOR") || roles.includes("SUPER_ADMIN");
  let barberId: number | null = null;
  if (hasBarberRole) {
    const [b] = await db
      .select({ id: barbers.id })
      .from(barbers)
      .where(and(eq(barbers.userId, row.id), eq(barbers.active, true)))
      .limit(1);
    barberId = b?.id ?? null;
  }
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role as Role,
    roles,
    permissions: permissionsForRoles(roles),
    barberId,
  };
}

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !roles.some((role) => user.roles.includes(role))) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has(permission)) throw new Error("UNAUTHORIZED");
  return user;
}

const STAFF_PANEL_ROLES: readonly Role[] = ["SUPER_ADMIN", "MANAGER", "RECEPTIONIST", "FINANCE"];

/** True when any of the user's roles opens the operations side (admin panels). */
export function isStaff(user: { roles: readonly Role[] }) {
  return user.roles.some((role) => STAFF_PANEL_ROLES.includes(role));
}

/** Panel a signed-in account lands on after login. */
export function landingPathFor(user: Pick<SessionUser, "roles" | "permissions">): string {
  if (isStaff(user)) return "/admin";
  if (user.permissions.has("booking:self")) return "/barber";
  return "/account";
}

