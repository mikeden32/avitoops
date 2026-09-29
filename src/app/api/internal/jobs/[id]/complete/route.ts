import { AppError } from "../../../../../../lib/errors";
import { authorizeInternal } from "../../../../../../lib/internal-auth";
import { completeJob } from "../../../../../../lib/services/jobs";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!authorizeInternal(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  let body: {
    status?: "done" | "failed";
    avito_url?: string;
    external_id?: string;
    error_code?: string;
    error_note?: string;
    spent_rub?: number;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (body.status !== "done" && body.status !== "failed") {
    return Response.json({ error: "status_required" }, { status: 400 });
  }
  try {
    const job = await completeJob(id, {
      status: body.status,
      avitoUrl: body.avito_url,
      externalId: body.external_id,
      errorCode: body.error_code,
      errorNote: body.error_note,
      spentRub: body.spent_rub,
    });
    return Response.json({ id: job.id, status: job.status });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
