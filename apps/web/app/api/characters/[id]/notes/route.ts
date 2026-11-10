import { respond } from "@/lib/api";
import { addNote } from "@/lib/characters";
import { apiWorkspace } from "@/lib/workspace";

/** Add an entry to the character's story memory. */
export async function POST(req: Request, ctx: RouteContext<"/api/characters/[id]/notes">) {
  const { ws, error } = await apiWorkspace("character:edit");
  if (error) return error;
  return respond(await addNote(ws, (await ctx.params).id, await req.json().catch(() => null)), 201);
}
