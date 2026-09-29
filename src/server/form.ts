import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import type { Upload } from "@/lib/files";

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

export async function readUploads(formData: FormData, key = "photos") {
  const files = formData
    .getAll(key)
    .filter((item): item is File => item instanceof File && item.size > 0);
  const uploads: Upload[] = [];
  for (const file of files) {
    uploads.push({
      filename: file.name,
      mime: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
  }
  return uploads;
}
