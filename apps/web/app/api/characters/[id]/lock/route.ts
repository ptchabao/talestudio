import { respond } from "@/lib/api";
import { lockCharacter, unlockCharacter } from "@/lib/characters";
import { apiWorkspace } from "@/lib/workspace";

/** Lock the identity (new version). */
export async function POST(_req: Request, ctx: RouteContext<"/api/characters/[id]/lock">) {
  const { ws, error } = await apiWorkspace("character:edit");
  if (error) return error;
  return respond(await lockCharacter(ws, (await ctx.params).id));
}

/** Unlock to edit the identity again. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/characters/[id]/lock">) {
  const { ws, error } = await apiWorkspace("character:edit");
  if (error) return error;
  return respond(await unlockCharacter(ws, (await ctx.params).id));
}
