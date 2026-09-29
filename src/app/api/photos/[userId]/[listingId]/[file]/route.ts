import { readFile } from "node:fs/promises";
import { auth } from "@/auth";
import { safeJoin } from "@/lib/files";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ userId: string; listingId: string; file: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const { userId, listingId, file } = await context.params;
  if (session.user.role !== "admin" && session.user.id !== userId) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const full = safeJoin(userId, listingId, file);
    const bytes = await readFile(full);
    const type = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": type, "cache-control": "private, max-age=3600" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
