import { respond } from "@/lib/api";
import { createProduction } from "@/lib/productions";
import { apiWorkspace } from "@/lib/workspace";

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/productions">) {
  const { ws, error } = await apiWorkspace("production:create");
  if (error) return error;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respond({ ok: false, status: 404, code: "not_found", error: "Project not found" });
  return respond(await createProduction(ws, id, await req.json().catch(() => null)), 201);
}
