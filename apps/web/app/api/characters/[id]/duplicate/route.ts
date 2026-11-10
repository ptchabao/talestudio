import { getDictionary } from "@/i18n/server";
import { respond } from "@/lib/api";
import { duplicateCharacter } from "@/lib/characters";
import { apiWorkspace } from "@/lib/workspace";

export async function POST(_req: Request, ctx: RouteContext<"/api/characters/[id]/duplicate">) {
  const { ws, error } = await apiWorkspace("character:edit");
  if (error) return error;
  const t = await getDictionary();
  return respond(await duplicateCharacter(ws, (await ctx.params).id, t.characters.copySuffix), 201);
}
