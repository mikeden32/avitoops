import { authorizeInternal } from "../../../../../lib/internal-auth";
import { runAgentCycle } from "../../../../../lib/services/agent-cycle";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!authorizeInternal(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runAgentCycle();
  return Response.json(result);
}
