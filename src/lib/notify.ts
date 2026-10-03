import { db } from "@/db";
import { notifications } from "@/db/schema";

/**
 * Fire-and-forget notification. Never throws — a notification failure must not
 * break the primary flow.
 */
export async function notify(
  targetRole: string,
  kind: string,
  title: string,
  body = "",
): Promise<void> {
  try {
    await db.insert(notifications).values({ targetRole, kind, title, body });
  } catch {
    /* never break the primary flow */
  }
}
