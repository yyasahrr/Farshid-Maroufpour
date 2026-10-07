import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/same-origin";

/**
 * Authorized uploads for public team profiles, portfolios, the Hero, and academy.
 * Files land in public/uploads; the matching route also serves files added after build.
 * Videos are capped at 80 MB; images at 5 MB.
 */
const VIDEO_EXT = new Set(["mp4", "webm", "mov"]);
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const MAX_VIDEO = 80 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signatureMatches(buffer: Buffer, extension: string): boolean {
  if (extension === "jpg" || extension === "jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === "png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === "webp") return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (extension === "avif") return buffer.toString("ascii", 4, 12).includes("ftyp") && /avif|avis/.test(buffer.toString("ascii", 8, 16));
  if (extension === "webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (extension === "mp4") return buffer.toString("ascii", 4, 8) === "ftyp";
  if (extension === "mov") return buffer.toString("ascii", 4, 8) === "ftyp" && buffer.toString("ascii", 8, 12) === "qt  ";
  return false;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "درخواست غیرمجاز است." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !(user.permissions.has("academy:manage") || user.permissions.has("settings:manage") || user.permissions.has("staff:manage") || user.permissions.has("booking:self")))
    return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
  if (!rateLimit(`upload:${user.id}`, 20, 60_000))
    return NextResponse.json({ error: "چند لحظه صبر کنید و دوباره آپلود کنید." }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "فایل انتخاب نشده است." }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase().replace(".", "");
  const isVideo = VIDEO_EXT.has(ext);
  const isImage = IMAGE_EXT.has(ext);
  if (isVideo && !(user.permissions.has("academy:manage") || user.permissions.has("settings:manage")))
    return NextResponse.json({ error: "برای این بخش فقط تصویر مجاز است." }, { status: 403 });
  if (!isVideo && !isImage)
    return NextResponse.json({ error: "فقط ویدیو (mp4, webm, mov) یا تصویر (jpg, png, webp, avif) مجاز است." }, { status: 400 });
  if (file.size > (isVideo ? MAX_VIDEO : MAX_IMAGE))
    return NextResponse.json(
      { error: isVideo ? "حجم ویدیو حداکثر ۸۰ مگابایت است." : "حجم تصویر حداکثر ۵ مگابایت است." },
      { status: 400 },
    );
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!signatureMatches(buffer, ext))
    return NextResponse.json({ error: "محتوای فایل با پسوند آن سازگار نیست." }, { status: 400 });
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const name = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${ext}`;
  await writeFile(path.join(dir, name), buffer);
  return NextResponse.json({ ok: true, url: `/uploads/${name}`, kind: isVideo ? "video" : "image" });
}
