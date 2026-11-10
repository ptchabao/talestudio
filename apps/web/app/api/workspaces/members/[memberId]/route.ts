import { respond } from "@/lib/api";
import { changeRole, removeMember } from "@/lib/team";
import { apiWorkspace } from "@/lib/workspace";

export async function PATCH(req: Request, ctx: RouteContext<"/api/workspaces/members/[memberId]">) {
  const { ws, error } = await apiWorkspace("members:manage");
  if (error) return error;
  return respond(await changeRole(ws, (await ctx.params).memberId, await req.json().catch(() => null)));
}

/** Admins remove members; anyone can leave (remove themselves). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/workspaces/members/[memberId]">) {
  const { ws, error } = await apiWorkspace();
  if (error) return error;
  return respond(await removeMember(ws, (await ctx.params).memberId));
}
