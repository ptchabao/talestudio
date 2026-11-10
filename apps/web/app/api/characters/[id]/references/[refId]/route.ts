import { respond } from "@/lib/api";
import { deleteReference, updateReference } from "@/lib/characters";
import { apiWorkspace } from "@/lib/workspace";

/** { approved: boolean } or { master: true }. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/characters/[id]/references/[refId]">) {
  const { ws, error } = await apiWorkspace("character:edit");
  if (error) return error;
  const { id, refId } = await ctx.params;
  return respond(await updateReference(ws, id, refId, await req.json().catch(() => null)));
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/characters/[id]/references/[refId]">) {
  const { ws, error } = await apiWorkspace("character:edit");
  if (error) return error;
  const { id, refId } = await ctx.params;
  return respond(await deleteReference(ws, id, refId));
}
