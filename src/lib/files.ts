import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export type Upload = { filename: string; mime: string; bytes: Buffer };

export function storageRoot() {
  return path.resolve(process.cwd(), "storage", "listings");
}

export function safeJoin(userId: string, listingId: string, filename: string) {
  if (!/^[\w.-]+$/.test(filename) || !/^[\w-]+$/.test(userId) || !/^[\w-]+$/.test(listingId)) {
    throw new AppError("Некорректное имя файла");
  }
  const root = storageRoot();
  const full = path.resolve(root, userId, listingId, filename);
  if (!full.startsWith(root + path.sep)) throw new AppError("Некорректный путь");
  return full;
}

export async function saveUploads(userId: string, listingId: string, uploads: Upload[]) {
  const names: string[] = [];
  for (const upload of uploads) {
    if (!ALLOWED.has(upload.mime)) throw new AppError("Фото только JPEG, PNG или WebP");
    if (upload.bytes.length === 0) continue;
    if (upload.bytes.length > 5 * 1024 * 1024) throw new AppError("Фото больше 5 МБ");
    const ext = upload.mime === "image/png" ? "png" : upload.mime === "image/webp" ? "webp" : "jpg";
    const filename = `${Date.now()}-${names.length}.${ext}`;
    const full = safeJoin(userId, listingId, filename);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, upload.bytes);
    names.push(filename);
  }
  return names;
}
