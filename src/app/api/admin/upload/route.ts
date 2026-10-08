import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, mediaAssets } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";
import { inspectMediaUpload } from "@/lib/media-validation";
import { removeMediaFile, storeMediaFile } from "@/lib/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isSafeInteger(contentLength) && contentLength > 90 * 1024 * 1024)
    return NextResponse.json({ error: "حجم درخواست بیش از حد مجاز است." }, { status: 413 });
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });

  const user = await getCurrentUser();
  const canUploadImages = Boolean(user && (
    user.permissions.has("academy:manage") ||
    user.permissions.has("settings:manage") ||
    user.permissions.has("staff:manage") ||
    user.permissions.has("booking:self")
  ));
  if (!user || !canUploadImages)
    return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
  if (!rateLimit(`upload:${user.id}`, 20, 60_000))
    return NextResponse.json({ error: "چند لحظه صبر کنید و دوباره آپلود کنید." }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "فایل انتخاب نشده است." }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isVideo = ["mp4", "webm", "mov"].includes(ext);
  const allowVideo = user.permissions.has("academy:manage") || user.permissions.has("settings:manage");
  if (isVideo && !allowVideo)
    return NextResponse.json({ error: "برای این بخش فقط تصویر مجاز است." }, { status: 403 });
  const maximumBytes = isVideo ? 80 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maximumBytes)
    return NextResponse.json({ error: isVideo ? "حجم ویدیو حداکثر ۸۰ مگابایت است." : "حجم تصویر حداکثر ۵ مگابایت است." }, { status: 400 });

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "خواندن فایل انجام نشد." }, { status: 400 });
  }
  const inspected = inspectMediaUpload(file.name, file.type, file.size, buffer, allowVideo);
  if (!inspected.ok) return NextResponse.json({ error: inspected.message }, { status: 400 });

  let storageKey: string | null = null;
  try {
    const storedKey = await storeMediaFile(buffer, inspected.media.extension);
    storageKey = storedKey;
    const asset = await db.transaction(async (tx) => {
      const [created] = await tx.insert(mediaAssets).values({
        storageKey: storedKey,
        originalName: inspected.media.originalName,
        mediaType: inspected.media.kind,
        mimeType: inspected.media.mimeType,
        fileSize: buffer.length,
        createdBy: user.id,
      }).returning({ id: mediaAssets.id });
      await tx.insert(auditLogs).values({
        actor: `user:${user.id}`,
        action: "MEDIA_ASSET_UPLOADED",
        target: `media:${created.id}`,
      });
      return created;
    });

    return NextResponse.json({
      ok: true,
      id: asset.id,
      url: `/uploads/${storedKey}`,
      kind: inspected.media.kind,
      mediaType: inspected.media.kind,
      originalName: inspected.media.originalName,
      mimeType: inspected.media.mimeType,
      fileSize: buffer.length,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    if (storageKey) await removeMediaFile(storageKey).catch(() => false);
    return NextResponse.json({ error: "ذخیرهٔ فایل انجام نشد؛ وضعیت ذخیره‌گاه رسانه و پایگاه‌داده را بررسی کنید." }, { status: 500 });
  }
}
