import path from "node:path";

export type MediaKind = "image" | "video";
export type ValidatedMedia = {
  kind: MediaKind;
  extension: string;
  mimeType: string;
  maxBytes: number;
  originalName: string;
};

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const VIDEO_MAX_BYTES = 80 * 1024 * 1024;

const IMAGE_TYPES: Record<string, { mimeType: string; matches: (buffer: Buffer) => boolean }> = {
  jpg: { mimeType: "image/jpeg", matches: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  jpeg: { mimeType: "image/jpeg", matches: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  png: { mimeType: "image/png", matches: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  webp: { mimeType: "image/webp", matches: (buffer) => buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" },
  avif: { mimeType: "image/avif", matches: (buffer) => buffer.toString("ascii", 4, 8) === "ftyp" && /avif|avis/.test(buffer.toString("ascii", 8, 16)) },
};

const VIDEO_TYPES: Record<string, { mimeType: string; matches: (buffer: Buffer) => boolean }> = {
  mp4: { mimeType: "video/mp4", matches: (buffer) => buffer.toString("ascii", 4, 8) === "ftyp" },
  mov: { mimeType: "video/quicktime", matches: (buffer) => buffer.toString("ascii", 4, 8) === "ftyp" && buffer.toString("ascii", 8, 12) === "qt  " },
  webm: { mimeType: "video/webm", matches: (buffer) => buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
};

export function sanitizeOriginalMediaName(filename: string): string {
  const leaf = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._() -]/gu, "_")
    .trim()
    .slice(0, 160);
  return cleaned || "media-file";
}

export function inspectMediaUpload(
  filename: string,
  declaredMimeType: string,
  size: number,
  buffer: Buffer,
  allowVideo = true,
): { ok: true; media: ValidatedMedia } | { ok: false; message: string } {
  const extension = path.extname(filename).slice(1).toLowerCase();
  const image = IMAGE_TYPES[extension];
  const video = allowVideo ? VIDEO_TYPES[extension] : undefined;
  const type = image ?? video;
  if (!type) return { ok: false, message: "فقط فایل‌های تصویری یا ویدیویی مجاز هستند." };

  const kind: MediaKind = image ? "image" : "video";
  const maxBytes = kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes)
    return { ok: false, message: kind === "image" ? "حجم تصویر حداکثر ۵ مگابایت است." : "حجم ویدیو حداکثر ۸۰ مگابایت است." };
  if (buffer.length !== size || !type.matches(buffer))
    return { ok: false, message: "محتوای فایل با نوع تصویری یا ویدیویی آن سازگار نیست." };
  if (declaredMimeType && declaredMimeType !== "application/octet-stream" && declaredMimeType !== type.mimeType)
    return { ok: false, message: "نوع اعلام‌شدهٔ فایل با پسوند آن سازگار نیست." };

  return {
    ok: true,
    media: {
      kind,
      extension,
      mimeType: type.mimeType,
      maxBytes,
      originalName: sanitizeOriginalMediaName(filename),
    },
  };
}

const STORED_MEDIA_KEY = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:jpe?g|png|webp|avif|mp4|webm|mov)$/i;
const LEGACY_UPLOAD_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,180}\.(?:jpe?g|png|webp|avif|gif|mp4|webm|mov)$/i;

export function isSafeStoredMediaKey(value: string): boolean {
  return STORED_MEDIA_KEY.test(value) && !value.includes("..") && !value.includes("/") && !value.includes("\\");
}

/** Narrow compatibility for previously uploaded single-file names; never permits paths. */
export function isSafeLegacyUploadName(value: string): boolean {
  return LEGACY_UPLOAD_NAME.test(value) && !value.includes("..") && !value.includes("/") && !value.includes("\\");
}

export function mediaMimeTypeForName(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
  };
  return types[extension] ?? "application/octet-stream";
}
