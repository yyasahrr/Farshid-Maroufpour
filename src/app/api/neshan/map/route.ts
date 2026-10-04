import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { neshanApiKey } from "@/lib/site-settings";

/** Public proxy for the Neshan static map so the API key never reaches the
 *  browser. Only finite coordinates inside Iran-ish bounds are proxied. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 20 || lat > 45 || lng < 40 || lng > 65)
    return new NextResponse("bad request", { status: 400 });
  const key = neshanApiKey();
  if (!key) return new NextResponse("not configured", { status: 503 });
  if (!rateLimit(`neshan-map:${lat.toFixed(3)}:${lng.toFixed(3)}`, 30, 60_000))
    return new NextResponse("slow down", { status: 429 });
  const url = `https://static.neshan.org/v1/map/standard/${lat},${lng},16,600x260?apiKey=${encodeURIComponent(key)}`;
  try {
    const upstream = await fetch(url, { cache: "force-cache", signal: AbortSignal.timeout(8000) });
    if (!upstream.ok || !upstream.body) return new NextResponse("map unavailable", { status: 502 });
    return new NextResponse(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/png",
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("map unavailable", { status: 502 });
  }
}
