/**
 * CSRF guard for cookie-authenticated mutations. Compares the browser Origin
 * against the Host the request actually arrived on (honoring proxies), instead
 * of `new URL(request.url)` which breaks behind port-forwards.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser client; auth + rate limits still apply
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const candidates = [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
  ]
    .filter((h): h is string => Boolean(h))
    .map((h) => h.split(",")[0].trim().toLowerCase());
  return candidates.includes(originHost);
}
