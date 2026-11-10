import { respond } from "@/lib/api";
import { approveProduction } from "@/lib/productions";
import { apiWorkspace } from "@/lib/workspace";

/** Approve the storyboard (or retry a failed production): production credits are reserved now. */
export async function POST(req: Request, ctx: RouteContext<"/api/episodes/[id]/approve">) {
  const { ws, error } = await apiWorkspace("production:approve");
  if (error) return error;
  return respond(await approveProduction(ws, (await ctx.params).id, await req.json().catch(() => ({}))), 202);
}
