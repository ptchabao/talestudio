import "server-only";
import { WELCOME_TOKENS } from "@talestudio/core";
import { applyCredits, db, schema } from "@talestudio/db";
import { randomBytes } from "node:crypto";

const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace";

/** New workspace with its creator as owner. Personal workspaces get the one-time welcome tokens; team workspaces start empty. */
export async function createWorkspace({ userId, name, personal }: { userId: string; name: string; personal: boolean }) {
  const [org] = await db
    .insert(schema.organization)
    .values({ name, slug: `${slugify(name)}-${randomBytes(3).toString("hex")}`, personal })
    .returning({ id: schema.organization.id });
  await db.insert(schema.member).values({ organizationId: org!.id, userId, role: "owner" });
  if (personal) {
    await applyCredits({ organizationId: org!.id, actorId: userId, delta: WELCOME_TOKENS, reason: "signup_grant", idempotencyKey: `signup:${userId}` });
  }
  return org!.id;
}

export const newInvitationToken = () => randomBytes(24).toString("base64url");
