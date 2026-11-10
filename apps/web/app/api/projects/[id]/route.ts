import { json, problem } from "@/lib/api";
import { getProjectView } from "@/lib/projects";
import { apiWorkspace } from "@/lib/workspace";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { ws, error } = await apiWorkspace("project:read");
  if (error) return error;
  const view = await getProjectView(ws.org.id, (await ctx.params).id).catch(() => null);
  return view ? json(view) : problem(404, "not_found", "Not found");
}
