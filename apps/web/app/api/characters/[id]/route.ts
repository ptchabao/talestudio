import { json, problem, respond } from "@/lib/api";
import { deleteCharacter, getCharacterView, updateCharacter } from "@/lib/characters";
import { apiWorkspace } from "@/lib/workspace";

export async function GET(_req: Request, ctx: RouteContext<"/api/characters/[id]">) {
  const { ws, error } = await apiWorkspace("project:read");
  if (error) return error;
  const view = await getCharacterView(ws.org.id, (await ctx.params).id);
  return view ? json(view) : problem(404, "not_found", "Character not found");
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/characters/[id]">) {
  const { ws, error } = await apiWorkspace("character:edit");
  if (error) return error;
  return respond(await updateCharacter(ws, (await ctx.params).id, await req.json().catch(() => null)));
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/characters/[id]">) {
  const { ws, error } = await apiWorkspace("character:edit");
  if (error) return error;
  return respond(await deleteCharacter(ws, (await ctx.params).id));
}
