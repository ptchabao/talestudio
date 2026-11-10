import { problem } from "@/lib/api";
import { exportCharacter } from "@/lib/characters";
import { apiWorkspace } from "@/lib/workspace";

/** Download the character as JSON (identity, memory, versions, approved references). */
export async function GET(_req: Request, ctx: RouteContext<"/api/characters/[id]/export">) {
  const { ws, error } = await apiWorkspace("project:read");
  if (error) return error;
  const data = await exportCharacter(ws.org.id, (await ctx.params).id);
  if (!data) return problem(404, "not_found", "Character not found");
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${data.slug}.talestudio.json"` },
  });
}
