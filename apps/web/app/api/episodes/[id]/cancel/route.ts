import { respond } from "@/lib/api";
import { cancelProduction } from "@/lib/productions";
import { apiWorkspace } from "@/lib/workspace";

export async function POST(_req: Request, ctx: RouteContext<"/api/episodes/[id]/cancel">) {
  const { ws, error } = await apiWorkspace("production:cancel");
  if (error) return error;
  return respond(await cancelProduction(ws, (await ctx.params).id), 202);
}
