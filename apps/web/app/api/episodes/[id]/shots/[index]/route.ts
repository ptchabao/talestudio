import { respond } from "@/lib/api";
import { editShot } from "@/lib/productions";
import { apiWorkspace } from "@/lib/workspace";

export async function PATCH(req: Request, ctx: RouteContext<"/api/episodes/[id]/shots/[index]">) {
  const { ws, error } = await apiWorkspace("production:edit");
  if (error) return error;
  const { id, index } = await ctx.params;
  return respond(await editShot(ws, id, Number(index), await req.json().catch(() => null)));
}
