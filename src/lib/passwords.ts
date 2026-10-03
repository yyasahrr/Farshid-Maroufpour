import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password storage helper.
 *
 * New credentials are stored with scrypt (salted, per-row parameters embedded in
 * the record). Rows created before this helper existed hold an unsalted SHA-256
 * digest; `verifyPassword` still accepts them so staff can keep signing in, and
 * `needsRehash` lets the login action upgrade those rows in place.
 */

const PREFIX = "scrypt";
const KEY_LENGTH = 64;
const COST = { N: 16_384, r: 8, p: 1 } as const;

function normalize(password: string): string {
  return password.normalize("NFKC");
}

/** Derives a new, salted scrypt record: `scrypt$<salt>$<digest>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(normalize(password), salt, KEY_LENGTH, COST);
  return `${PREFIX}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

/** Legacy scheme, retained only to verify pre-existing staff rows. */
function legacyHash(password: string): string {
  return createHash("sha256").update(`${password}::salon`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPassword(stored: string | null | undefined, password: string): boolean {
  if (!stored) return false;
  if (stored.startsWith(`${PREFIX}$`)) {
    const [, salt, digest] = stored.split("$");
    if (!salt || !digest) return false;
    try {
      const expected = scryptSync(normalize(password), Buffer.from(salt, "base64url"), KEY_LENGTH, COST);
      return safeEqual(expected.toString("base64url"), digest);
    } catch {
      return false;
    }
  }
  return safeEqual(legacyHash(password), stored);
}

/** True when the stored record should be rewritten with the current scheme. */
export function needsRehash(stored: string | null | undefined): boolean {
  return Boolean(stored) && !stored!.startsWith(`${PREFIX}$`);
}
