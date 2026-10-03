type Bucket = { count: number; resetAt: number };

const globalForLimiter = globalThis as typeof globalThis & {
  __salonRateLimiter?: Map<string, Bucket>;
};

const buckets = (globalForLimiter.__salonRateLimiter ??= new Map<string, Bucket>());

/** Above this many tracked keys the map is swept so long-lived processes stay bounded. */
const MAX_KEYS = 5_000;

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Simple in-memory fixed-window limiter. Returns false when the limit is exceeded. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
