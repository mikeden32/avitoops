import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import type { Upload } from "@/lib/files";
import { PHOTO_LIMITS, photoTooBigMessage } from "@/lib/photo-limits";

export function bail(path: string, error: unknown): never {
  if (!(error instanceof AppError)) throw error;
  const join = path.includes("?") ? "&" : "?";
  redirect(`${path}${join}error=${encodeURIComponent(error.message)}`);
}

export function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export function tags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function readUploads(formData: FormData, key = "photos") {
  const files = formData
    .getAll(key)
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length > PHOTO_LIMITS.maxCount) {
    throw new AppError(`Не больше ${PHOTO_LIMITS.maxCount} фото`);
  }
  const uploads: Upload[] = [];
  for (const file of files) {
    if (file.type && !ALLOWED.has(file.type)) throw new AppError("Фото только JPEG, PNG или WebP");
    if (file.size > PHOTO_LIMITS.maxIncomingBytes) throw new AppError(photoTooBigMessage());
    uploads.push({
      filename: file.name,
      mime: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
    });
  }
  return uploads;
}
