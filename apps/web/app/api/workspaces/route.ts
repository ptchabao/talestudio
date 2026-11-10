import { respond } from "@/lib/api";
import { createTeamWorkspace } from "@/lib/team";
import { apiWorkspace, WORKSPACE_COOKIE } from "@/lib/workspace";
import { cookies } from "next/headers";

/** Create a team workspace and switch to it. Any signed-in user can. */
export async function POST(req: Request) {
  const { ws, error } = await apiWorkspace();
  if (error) return error;
  const res = await createTeamWorkspace(ws, await req.json().catch(() => null));
  if (res.ok) (await cookies()).set(WORKSPACE_COOKIE, res.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 31536000 });
  return respond(res, 201);
}
