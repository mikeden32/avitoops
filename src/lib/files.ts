import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "./errors";
import { PHOTO_LIMITS, photoTooBigMessage } from "./photo-limits";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

sharp.cache(false);
sharp.concurrency(1);

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

export function assertUploads(uploads: Upload[], already = 0) {
  const present = uploads.filter((item) => item.bytes.length > 0);
  if (present.length + already > PHOTO_LIMITS.maxCount) {
    throw new AppError(`Не больше ${PHOTO_LIMITS.maxCount} фото`);
  }
  for (const upload of present) {
    if (!ALLOWED.has(upload.mime) && !sniffImage(upload.bytes)) {
      throw new AppError("Фото только JPEG, PNG или WebP");
    }
    if (upload.bytes.length > PHOTO_LIMITS.maxIncomingBytes) {
      throw new AppError(photoTooBigMessage());
    }
  }
}

export async function saveUploads(userId: string, listingId: string, uploads: Upload[]) {
  assertUploads(uploads);
  const names: string[] = [];
  try {
    for (const upload of uploads) {
      if (upload.bytes.length === 0) continue;
      const stored = await compressPhoto(upload.bytes);
      const filename = `${Date.now()}-${names.length}.jpg`;
      const full = safeJoin(userId, listingId, filename);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, stored);
      names.push(filename);
    }
  } catch (error) {
    await Promise.all(names.map((name) => rm(safeJoin(userId, listingId, name), { force: true })));
    if (error instanceof AppError) throw error;
    throw asPhotoError(error);
  }
  return names;
}

export async function compressPhoto(bytes: Buffer) {
  const stored = await encode(bytes, PHOTO_LIMITS.maxEdge, PHOTO_LIMITS.jpegQuality);
  if (stored.length <= PHOTO_LIMITS.maxIncomingBytes) return stored;
  const softer = await encode(stored, PHOTO_LIMITS.maxEdge, 80);
  if (softer.length <= PHOTO_LIMITS.maxIncomingBytes) return softer;
  return encode(softer, 1600, 82);
}

async function encode(bytes: Buffer, edge: number, quality: number) {
  try {
    return await sharp(bytes, {
      failOn: "error",
      animated: false,
      limitInputPixels: PHOTO_LIMITS.maxInputPixels,
      sequentialRead: true,
    })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    throw asPhotoError(error);
  }
}

export function inboxFile(userId: string, filename: string) {
  if (!/^[\w-]+$/.test(userId) || !/^[\w.-]+$/.test(filename)) {
    throw new AppError("Некорректное имя файла");
  }
  const root = path.resolve(process.cwd(), "storage", "inbox");
  const full = path.resolve(root, userId, filename);
  if (!full.startsWith(root + path.sep)) throw new AppError("Некорректный путь");
  return full;
}

function sniffImage(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return true;
  }
  return bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
}

function asPhotoError(error: unknown) {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message.toLowerCase().includes("pixel limit")) {
    return new AppError("Слишком большое разрешение фото");
  }
  return new AppError("Не удалось прочитать фото");
}
