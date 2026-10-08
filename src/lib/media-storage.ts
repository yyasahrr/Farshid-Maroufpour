import { mkdir, lstat, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isSafeLegacyUploadName, isSafeStoredMediaKey } from "@/lib/media-validation";

export function mediaStorageRoot(): string {
  const configured = process.env.MEDIA_STORAGE_DIR?.trim();
  const root = configured ? path.resolve(configured) : path.join(process.cwd(), "var", "media");
  const publicRoot = path.resolve(process.cwd(), "public");
  const relativeToPublic = path.relative(publicRoot, root);
  if (relativeToPublic === "" || (!relativeToPublic.startsWith("..") && !path.isAbsolute(relativeToPublic)))
    throw new Error("MEDIA_STORAGE_DIR_MUST_BE_OUTSIDE_PUBLIC");
  return root;
}

function assertContained(root: string, filename: string): string | null {
  const fullPath = path.resolve(root, filename);
  const relative = path.relative(root, fullPath);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return null;
  return fullPath;
}

export async function storeMediaFile(buffer: Buffer, extension: string): Promise<string> {
  const normalizedExtension = extension.toLowerCase();
  if (!/^(?:jpe?g|png|webp|avif|mp4|webm|mov)$/.test(normalizedExtension))
    throw new Error("UNSUPPORTED_MEDIA_EXTENSION");
  const root = mediaStorageRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const rootPath = await realpath(root);
  const storageKey = `${randomUUID()}.${normalizedExtension}`;
  const fullPath = assertContained(rootPath, storageKey);
  if (!fullPath) throw new Error("INVALID_MEDIA_PATH");
  await writeFile(fullPath, buffer, { flag: "wx", mode: 0o600 });
  return storageKey;
}

export async function resolveMediaFile(storageKey: string): Promise<string | null> {
  const generatedKey = isSafeStoredMediaKey(storageKey);
  const legacyKey = isSafeLegacyUploadName(storageKey);
  if (!generatedKey && !legacyKey) return null;

  const roots = [mediaStorageRoot()];
  const publicLegacyRoot = path.join(process.cwd(), "public", "uploads");
  if (path.resolve(publicLegacyRoot) !== path.resolve(roots[0])) roots.push(publicLegacyRoot);

  for (const root of roots) {
    try {
      const rootPath = await realpath(root);
      const fullPath = assertContained(rootPath, storageKey);
      if (!fullPath) continue;
      const entry = await lstat(fullPath);
      if (!entry.isFile() || entry.isSymbolicLink()) continue;
      const actualPath = await realpath(fullPath);
      if (assertContained(rootPath, path.relative(rootPath, actualPath)) !== actualPath) continue;
      return actualPath;
    } catch {
      // Try the legacy root when a configured persistent volume lacks this key.
    }
  }
  return null;
}

export async function removeMediaFile(storageKey: string): Promise<boolean> {
  if (!isSafeStoredMediaKey(storageKey)) return false;
  const fullPath = await resolveMediaFile(storageKey);
  if (!fullPath) return false;
  try {
    await unlink(fullPath);
    return true;
  } catch {
    return false;
  }
}


export type QuarantinedMediaFile = { originalPath: string; quarantinePath: string };

/** Atomically take an unreferenced file out of public URL resolution before deleting its row. */
export async function quarantineMediaFile(storageKey: string): Promise<QuarantinedMediaFile | null> {
  if (!isSafeStoredMediaKey(storageKey)) return null;
  const originalPath = await resolveMediaFile(storageKey);
  if (!originalPath) return null;
  const quarantinePath = path.join(path.dirname(originalPath), `.media-delete-${randomUUID()}.tmp`);
  try {
    await rename(originalPath, quarantinePath);
    return { originalPath, quarantinePath };
  } catch {
    return null;
  }
}

export async function restoreQuarantinedMediaFile(file: QuarantinedMediaFile): Promise<boolean> {
  try {
    await rename(file.quarantinePath, file.originalPath);
    return true;
  } catch {
    return false;
  }
}

/** The tombstone name is not a routable media key, even if physical cleanup fails. */
export async function finalizeQuarantinedMediaFile(file: QuarantinedMediaFile): Promise<boolean> {
  try {
    await unlink(file.quarantinePath);
    return true;
  } catch {
    return false;
  }
}
