import { respond } from "@/lib/api";
import { selectHighlights } from "@/lib/productions";
import { apiWorkspace } from "@/lib/workspace";

export async function PUT(req: Request, ctx: RouteContext<"/api/episodes/[id]/highlights">) {
  const { ws, error } = await apiWorkspace("production:edit");
  if (error) return error;
  return respond(await selectHighlights(ws, (await ctx.params).id, await req.json().catch(() => null)));
}
