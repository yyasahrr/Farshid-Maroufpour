import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { neshanSearch } from "@/lib/site-settings";

/** Staff-only address lookup used by the admin location panel. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("settings:manage"))
    return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ ok: true, items: [], enabled: true });
  if (!rateLimit(`neshan:${user.id}`, 30, 60_000))
    return NextResponse.json({ error: "درخواست‌های مکرر؛ کمی صبر کنید." }, { status: 429 });
  const result = await neshanSearch(q);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
