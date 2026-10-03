import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSecrets } from "@/db/schema";

let cached: Promise<string> | null = null;

/** Session/OTP signing key is generated once per database when no deployment secret is supplied. */
export function sessionSigningSecret(): Promise<string> {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32)
    return Promise.resolve(process.env.SESSION_SECRET);
  cached ??= (async () => {
    const candidate = randomBytes(48).toString("hex");
    await db.insert(appSecrets).values({ key: "session-hmac-v1", value: candidate })
      .onConflictDoNothing({ target: appSecrets.key });
    const [stored] = await db.select({ value: appSecrets.value }).from(appSecrets)
      .where(eq(appSecrets.key, "session-hmac-v1")).limit(1);
    if (!stored) throw new Error("Unable to initialize signing key");
    return stored.value;
  })().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}
