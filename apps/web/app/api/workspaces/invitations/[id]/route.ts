import { json } from "@/lib/api";
import { revokeInvitation } from "@/lib/team";
import { apiWorkspace } from "@/lib/workspace";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/workspaces/invitations/[id]">) {
  const { ws, error } = await apiWorkspace("members:manage");
  if (error) return error;
  await revokeInvitation(ws, (await ctx.params).id);
  return json({ ok: true });
}
