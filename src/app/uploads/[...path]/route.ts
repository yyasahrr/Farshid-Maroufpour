import { NextResponse } from "next/server";
import { createReadStream, promises as fsp } from "node:fs";
import { Readable } from "node:stream";
import { mediaMimeTypeForName } from "@/lib/media-validation";
import { resolveMediaFile } from "@/lib/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fileStream(fullPath: string, start?: number, end?: number): ReadableStream {
  return Readable.toWeb(
    start === undefined || end === undefined
      ? createReadStream(fullPath)
      : createReadStream(fullPath, { start, end }),
  ) as ReadableStream;
}

function rangeNotSatisfiable(size: number) {
  return new NextResponse(null, {
    status: 416,
    headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes" },
  });
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  // Uploaded assets are deliberately flat random names, never caller-controlled paths.
  if (!parts || parts.length !== 1) return new NextResponse(null, { status: 404 });
  const storageKey = parts[0];
  const fullPath = await resolveMediaFile(storageKey);
  if (!fullPath) return new NextResponse(null, { status: 404 });

  try {
    const stat = await fsp.stat(fullPath);
    if (!stat.isFile()) return new NextResponse(null, { status: 404 });
    const headers = {
      "content-type": mediaMimeTypeForName(storageKey),
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    };
    const range = request.headers.get("range");
    if (!range) {
      return new NextResponse(fileStream(fullPath), {
        headers: { ...headers, "content-length": String(stat.size) },
      });
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || stat.size === 0) return rangeNotSatisfiable(stat.size);

    let start: number;
    let end: number;
    if (match[1] === "") {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return rangeNotSatisfiable(stat.size);
      start = Math.max(0, stat.size - suffixLength);
      end = stat.size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? stat.size - 1 : Number(match[2]);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= stat.size || end < start)
      return rangeNotSatisfiable(stat.size);
    end = Math.min(end, stat.size - 1);

    return new NextResponse(fileStream(fullPath, start, end), {
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
