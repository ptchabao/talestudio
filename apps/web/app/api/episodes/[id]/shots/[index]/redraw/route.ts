import { respond } from "@/lib/api";
import { redrawShot } from "@/lib/productions";
import { apiWorkspace } from "@/lib/workspace";

export async function POST(_req: Request, ctx: RouteContext<"/api/episodes/[id]/shots/[index]/redraw">) {
  const { ws, error } = await apiWorkspace("production:edit");
  if (error) return error;
  const { id, index } = await ctx.params;
  return respond(await redrawShot(ws, id, Number(index)), 202);
}
