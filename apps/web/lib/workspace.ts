import "server-only";
import { can, type Permission, type Role } from "@talestudio/core";
import { asc, db, eq, schema } from "@talestudio/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSession } from "./auth";
import { problem } from "./api";

export const WORKSPACE_COOKIE = "ts-ws";

export interface WorkspaceContext {
  user: { id: string; name: string; email: string };
  org: typeof schema.organization.$inferSelect;
  role: Role;
  memberships: { id: string; name: string; personal: boolean; role: Role }[];
}

/**
 * The active workspace: the one named by the cookie if the user is still a member of it,
 * otherwise their first workspace (personal first). Membership is the only source of access.
 */
export const getWorkspace = cache(async (): Promise<WorkspaceContext | null> => {
  const session = await getSession();
  if (!session) return null;
  const rows = await db.query.member.findMany({
    where: eq(schema.member.userId, session.user.id),
    with: { organization: true },
    orderBy: asc(schema.member.createdAt),
  });
  if (!rows.length) return null;
  const wanted = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const active = rows.find((r) => r.organizationId === wanted) ?? rows.find((r) => r.organization.personal) ?? rows[0]!;
  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    org: active.organization,
    role: active.role,
    memberships: rows.map((r) => ({ id: r.organizationId, name: r.organization.name, personal: r.organization.personal, role: r.role })),
  };
});

/** Pages: redirect to sign-in when signed out; to the dashboard when the role lacks the permission. */
export async function requireWorkspace(permission?: Permission): Promise<WorkspaceContext> {
  const ws = await getWorkspace();
  if (!ws) redirect("/sign-in");
  if (permission && !can(ws.role, permission)) redirect("/dashboard");
  return ws;
}

/** API routes: returns either the context or a ready-to-send 401/403 response. */
export async function apiWorkspace(permission?: Permission): Promise<{ ws: WorkspaceContext; error?: never } | { ws?: never; error: Response }> {
  const ws = await getWorkspace();
  if (!ws) return { error: problem(401, "unauthorized", "Unauthorized") };
  if (permission && !can(ws.role, permission)) return { error: problem(403, "forbidden", `Your role (${ws.role}) cannot do this`) };
  return { ws };
}
