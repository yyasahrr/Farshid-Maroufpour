import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "برای دیدن کتابخانه وارد شوید." }, { status: 401 });
  const canSeeAll = user.permissions.has("settings:manage") || user.permissions.has("staff:manage") || user.permissions.has("academy:manage");
  if (!canSeeAll && !user.permissions.has("booking:self"))
    return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });

  const rows = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      originalName: mediaAssets.originalName,
      mediaType: mediaAssets.mediaType,
      mimeType: mediaAssets.mimeType,
      fileSize: mediaAssets.fileSize,
      createdAt: mediaAssets.createdAt,
    })
    .from(mediaAssets)
    .where(canSeeAll ? undefined : eq(mediaAssets.createdBy, user.id))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(100);

  return NextResponse.json({
    assets: rows.map((asset) => ({ ...asset, url: `/uploads/${asset.storageKey}` })),
  }, { headers: { "cache-control": "no-store" } });
}
