import { respond } from "@/lib/api";
import { generateForCharacter } from "@/lib/characters";
import { apiWorkspace } from "@/lib/workspace";

/** Paid generation: { kind: "candidates" | "pack" | "extra", extra?: { kind, description } }. */
export async function POST(req: Request, ctx: RouteContext<"/api/characters/[id]/generate">) {
  const { ws, error } = await apiWorkspace("character:edit");
  if (error) return error;
  return respond(await generateForCharacter(ws, (await ctx.params).id, await req.json().catch(() => null)), 202);
}
