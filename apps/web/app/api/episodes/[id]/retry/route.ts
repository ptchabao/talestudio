import { respond } from "@/lib/api";
import { retryProduction } from "@/lib/productions";
import { apiWorkspace } from "@/lib/workspace";

/** Relaunch a failed or canceled production from the step that stopped (storyboard or production). */
export async function POST(req: Request, ctx: RouteContext<"/api/episodes/[id]/retry">) {
  const { ws, error } = await apiWorkspace("production:approve");
  if (error) return error;
  return respond(await retryProduction(ws, (await ctx.params).id, await req.json().catch(() => ({}))), 202);
}
