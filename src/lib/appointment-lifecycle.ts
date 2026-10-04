import { sql } from "drizzle-orm";

/**
 * Pending online bookings that never got their payment verified are
 * auto-cancelled once the 10-minute window passes — everywhere, not only when
 * somebody tries to pay. Without this, an expired PENDING row keeps its slot
 * reserved against the partial unique index while the scheduler (which skips
 * expired pendings) happily plans on top of it → insert-time conflict.
 *
 * Only ONLINE + PENDING is swept: AWAITING_APPROVAL (manager-gated) and
 * walk-in rows never expire silently.
 */
export const PENDING_PAYMENT_GRACE_MS = 10 * 60_000;

type DbLike = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

/** Cancels expired pendings; returns the affected appointment ids. */
export async function sweepExpiredPending(db: DbLike): Promise<number[]> {
  const result = (await db.execute(sql`
    update appointments
    set status = 'CANCELLED_EXPIRED'
    where status = 'PENDING'
      and source = 'ONLINE'
      and created_at < now() - interval '10 minutes'
    returning id
  `)) as unknown;
  const list = Array.isArray(result)
    ? (result as { id: number }[])
    : ((result as { rows?: { id: number }[] }).rows ?? []);
  const affected = list.map((r) => r.id);
  if (affected.length > 0) {
    const ids = affected.join(",");
    await db.execute(sql`
      insert into audit_logs(actor, action, target)
      values ('system', 'VISIT_BOOKING_EXPIRED', ${`appointments:${ids}`})
    `);
  }
  return affected;
}
