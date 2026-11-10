import { json, problem } from "@/lib/api";
import { getProductionView } from "@/lib/productions";
import { apiWorkspace } from "@/lib/workspace";

export async function GET(_req: Request, ctx: RouteContext<"/api/episodes/[id]">) {
  const { ws, error } = await apiWorkspace("project:read");
  if (error) return error;
  const view = await getProductionView(ws.org.id, (await ctx.params).id);
  return view ? json(view) : problem(404, "not_found", "Not found");
}
