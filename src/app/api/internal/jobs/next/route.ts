import type { JobType } from "../../../../../lib/db/schema";
import { authorizeInternal } from "../../../../../lib/internal-auth";
import { publicJob, takeNextJob } from "../../../../../lib/services/jobs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!authorizeInternal(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { agent?: string; types?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const agent = body.agent?.trim() ?? "";
  if (!/^[\w.-]{1,80}$/.test(agent)) {
    return Response.json({ error: "agent_required" }, { status: 400 });
  }
  const allowed = new Set(["publish", "update", "reply", "promo", "report"]);
  const types = body.types?.filter((item): item is JobType => allowed.has(item));
  const job = await takeNextJob(agent, types && types.length > 0 ? types : undefined);
  return Response.json({ job: job ? publicJob(job) : null });
}
