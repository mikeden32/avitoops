import { z } from "zod";
import { AppError } from "../../../../lib/errors";
import { authorizeInternal } from "../../../../lib/internal-auth";
import { createDigest } from "../../../../lib/services/leads";
import { dispatchPending } from "../../../../lib/services/notifications";

export const runtime = "nodejs";

const bodySchema = z.object({
  user_id: z.string().uuid(),
  listing_id: z.string().uuid().optional(),
  preview: z.string().min(1),
  urgency: z.enum(["hot", "normal"]).default("normal"),
});

export async function POST(req: Request) {
  if (!authorizeInternal(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "bad_body" }, { status: 400 });
  try {
    const row = await createDigest({
      userId: parsed.data.user_id,
      listingId: parsed.data.listing_id,
      preview: parsed.data.preview,
      urgency: parsed.data.urgency,
      actor: "system",
    });
    await dispatchPending();
    return Response.json({ id: row.id, status: row.status });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
