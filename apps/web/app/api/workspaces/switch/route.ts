import { json, problem } from "@/lib/api";
import { apiWorkspace, WORKSPACE_COOKIE } from "@/lib/workspace";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { ws, error } = await apiWorkspace();
  if (error) return error;
  const { id } = ((await req.json().catch(() => null)) ?? {}) as { id?: string };
  if (!id || !ws.memberships.some((m) => m.id === id)) return problem(404, "not_found", "Not a member of this workspace");
  (await cookies()).set(WORKSPACE_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 31536000 });
  return json({ ok: true });
}
