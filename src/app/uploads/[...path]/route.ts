import { NextResponse } from "next/server";
import { createReadStream, promises as fsp } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * Serves files uploaded through /api/admin/upload (posters, lesson videos).
 *
 * `public/uploads` is also served statically by Next, but a production build
 * snapshots that directory — files uploaded after the build would 404 until
 * the next rebuild. This route reads from disk on every request, so new
 * uploads work in dev AND prod without a redeploy. Uploaded files never
 * leave this directory; the path is strictly contained.
 */

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const rel = (parts ?? []).join("/");
  const full = path.normalize(path.join(UPLOAD_ROOT, rel));
  if (!full.startsWith(UPLOAD_ROOT + path.sep)) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const stat = await fsp.stat(full);
    if (!stat.isFile()) return new NextResponse(null, { status: 404 });
    const type = TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream";
    const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        "content-type": type,
        "content-length": String(stat.size),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
