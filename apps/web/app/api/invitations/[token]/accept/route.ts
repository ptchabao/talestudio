import { apiUser, problem, respond } from "@/lib/api";
import { acceptInvitation } from "@/lib/team";
import { WORKSPACE_COOKIE } from "@/lib/workspace";
import { cookies } from "next/headers";

export async function POST(_req: Request, ctx: RouteContext<"/api/invitations/[token]/accept">) {
  const user = await apiUser();
  if (!user) return problem(401, "unauthorized", "Unauthorized");
  const res = await acceptInvitation(user, (await ctx.params).token);
  if (res.ok) (await cookies()).set(WORKSPACE_COOKIE, res.orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 31536000 });
  return respond(res);
}
