import { NextResponse } from "next/server";
import { createReadStream, promises as fsp } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * Serves files uploaded through /api/admin/upload (profile/portfolio images and Hero or academy media).
 * `public/uploads` is snapshotted during a production build; reading from disk
 * here also makes files added after build available without a redeploy.
 */
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

function fileStream(fullPath: string, start?: number, end?: number): ReadableStream {
  return Readable.toWeb(
    start === undefined || end === undefined
      ? createReadStream(fullPath)
      : createReadStream(fullPath, { start, end }),
  ) as ReadableStream;
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
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
    const headers = {
      "content-type": type,
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    };
    const range = request.headers.get("range");
    if (!range) {
      return new NextResponse(fileStream(full), {
        headers: { ...headers, "content-length": String(stat.size) },
      });
    }

    // Support the single byte range used by browsers for video playback/seeking.
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || stat.size === 0) {
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${stat.size}`, "accept-ranges": "bytes" },
      });
    }

    let start: number;
    let end: number;
    if (match[1] === "") {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        return new NextResponse(null, {
          status: 416,
          headers: { "content-range": `bytes */${stat.size}`, "accept-ranges": "bytes" },
        });
      }
      start = Math.max(0, stat.size - suffixLength);
      end = stat.size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? stat.size - 1 : Number(match[2]);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= stat.size || end < start) {
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${stat.size}`, "accept-ranges": "bytes" },
      });
    }
    end = Math.min(end, stat.size - 1);

    return new NextResponse(fileStream(full, start, end), {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${stat.size}`,
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
