import "server-only";
import { assignableRoles, ROLES, type Role } from "@talestudio/core";
import { and, asc, db, eq, isNull, schema, sql } from "@talestudio/db";
import { z } from "zod";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { actionEmail, sendEmail } from "./email";
import { appUrl } from "./url";
import { fail, invalidInput, type Failure } from "./validation";
import { createWorkspace, newInvitationToken } from "./workspace-admin";
import type { WorkspaceContext } from "./workspace";

const INVITE_TTL_DAYS = 7;

export async function listTeam(orgId: string) {
  const [members, invitations] = await Promise.all([
    db.query.member.findMany({ where: eq(schema.member.organizationId, orgId), with: { user: { columns: { id: true, name: true, email: true } } }, orderBy: asc(schema.member.createdAt) }),
    db.query.invitation.findMany({ where: and(eq(schema.invitation.organizationId, orgId), isNull(schema.invitation.acceptedAt)), orderBy: asc(schema.invitation.createdAt) }),
  ]);
  return {
    members: members.map((m) => ({ id: m.id, role: m.role, user: m.user, joinedAt: m.createdAt.toISOString() })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expired: i.expiresAt < new Date(), link: `${appUrl()}/invite/${i.token}` })),
  };
}

const inviteInput = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(ROLES) });

/** No email provider is wired yet: the invite link is returned so the admin can share it. */
export async function invite(ws: WorkspaceContext, raw: unknown): Promise<{ ok: true; link: string; emailed: boolean } | Failure> {
  const parsed = inviteInput.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  if (ws.org.personal) return fail(409, "personal_workspace", "Personal workspaces can't have members");
  if (!assignableRoles(ws.role).includes(parsed.data.role)) return fail(403, "forbidden", "You can't grant a role above yours");
  const already = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(eq(schema.member.organizationId, ws.org.id), sql`lower(${schema.user.email}) = ${parsed.data.email}`));
  if (already.length) return fail(409, "already_member", "Already a member");
  const token = newInvitationToken();
  await db.insert(schema.invitation).values({ organizationId: ws.org.id, email: parsed.data.email, role: parsed.data.role, token, invitedBy: ws.user.id, expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000) });
  const link = `${appUrl()}/invite/${token}`;
  const t = await getDictionary();
  const mail = actionEmail({
    title: fmt(t.emails.inviteTitle, { inviter: ws.user.name, workspace: ws.org.name }),
    body: fmt(t.emails.inviteBody, { role: t.roles[parsed.data.role], days: INVITE_TTL_DAYS }),
    cta: t.invite.accept,
    url: link,
    footer: t.emails.footer,
  });
  const emailed = await sendEmail({ to: parsed.data.email, subject: fmt(t.emails.inviteSubject, { workspace: ws.org.name }), ...mail });
  return { ok: true, link, emailed };
}

export async function revokeInvitation(ws: WorkspaceContext, id: string) {
  await db.delete(schema.invitation).where(and(eq(schema.invitation.id, id), eq(schema.invitation.organizationId, ws.org.id)));
}

export async function getInvitation(token: string) {
  const inv = await db.query.invitation.findFirst({ where: eq(schema.invitation.token, token), with: { organization: { columns: { id: true, name: true } } } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return null;
  return inv;
}

/** The invite is bound to an email address: only that account can accept it. */
export async function acceptInvitation(user: { id: string; email: string }, token: string): Promise<{ ok: true; orgId: string } | Failure> {
  const inv = await getInvitation(token);
  if (!inv) return fail(404, "invalid_invitation", "Invitation not found or expired");
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) return fail(403, "invitation_email_mismatch", "This invitation is for another email address", { email: inv.email });
  await db.transaction(async (tx) => {
    await tx.insert(schema.member).values({ organizationId: inv.organizationId, userId: user.id, role: inv.role }).onConflictDoNothing();
    await tx.update(schema.invitation).set({ acceptedAt: new Date() }).where(eq(schema.invitation.id, inv.id));
  });
  return { ok: true, orgId: inv.organizationId };
}

async function ownerCount(orgId: string) {
  const rows = await db.select({ id: schema.member.id }).from(schema.member).where(and(eq(schema.member.organizationId, orgId), eq(schema.member.role, "owner")));
  return rows.length;
}

/** Admins manage members up to their own level; the last owner can never be demoted or removed. */
export async function changeRole(ws: WorkspaceContext, memberId: string, raw: unknown): Promise<{ ok: true } | Failure> {
  const parsed = z.object({ role: z.enum(ROLES) }).safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  const m = await db.query.member.findFirst({ where: and(eq(schema.member.id, memberId), eq(schema.member.organizationId, ws.org.id)) });
  if (!m) return fail(404, "not_found", "Member not found");
  const allowed = assignableRoles(ws.role);
  if (!allowed.includes(m.role) || !allowed.includes(parsed.data.role)) return fail(403, "forbidden", "Not allowed for your role");
  if (m.role === "owner" && parsed.data.role !== "owner" && (await ownerCount(ws.org.id)) <= 1) return fail(409, "last_owner", "A workspace needs at least one owner");
  await db.update(schema.member).set({ role: parsed.data.role as Role }).where(eq(schema.member.id, memberId));
  return { ok: true };
}

export async function removeMember(ws: WorkspaceContext, memberId: string): Promise<{ ok: true } | Failure> {
  const m = await db.query.member.findFirst({ where: and(eq(schema.member.id, memberId), eq(schema.member.organizationId, ws.org.id)) });
  if (!m) return fail(404, "not_found", "Member not found");
  const self = m.userId === ws.user.id;
  if (!self && !assignableRoles(ws.role).includes(m.role)) return fail(403, "forbidden", "Not allowed for your role");
  if (m.role === "owner" && (await ownerCount(ws.org.id)) <= 1) return fail(409, "last_owner", "A workspace needs at least one owner");
  await db.delete(schema.member).where(eq(schema.member.id, memberId));
  return { ok: true };
}

export async function createTeamWorkspace(ws: WorkspaceContext, raw: unknown): Promise<{ ok: true; id: string } | Failure> {
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  return { ok: true, id: await createWorkspace({ userId: ws.user.id, name: parsed.data.name, personal: false }) };
}
