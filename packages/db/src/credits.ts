import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./client";
import { creditLedger, organization } from "./schema";

type Reason = (typeof creditLedger.$inferInsert)["reason"];

export class InsufficientCreditsError extends Error {
  constructor(public readonly needed: number) {
    super(`Insufficient credits: ${needed} required`);
  }
}

/**
 * Atomically move credits and write the ledger row.
 * Idempotent when `idempotencyKey` is given: a replay is a no-op and returns false.
 */
export async function applyCredits(opts: {
  organizationId: string;
  actorId?: string | null;
  delta: number;
  reason: Reason;
  episodeId?: string;
  idempotencyKey?: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (opts.idempotencyKey) {
      const inserted = await tx
        .insert(creditLedger)
        .values({ ...opts })
        .onConflictDoNothing({ target: creditLedger.idempotencyKey })
        .returning({ id: creditLedger.id });
      if (inserted.length === 0) return false;
    } else {
      await tx.insert(creditLedger).values({ ...opts });
    }

    const where =
      opts.delta < 0 ? and(eq(organization.id, opts.organizationId), gte(organization.credits, -opts.delta)) : eq(organization.id, opts.organizationId);
    const updated = await tx
      .update(organization)
      .set({ credits: sql`${organization.credits} + ${opts.delta}` })
      .where(where)
      .returning({ credits: organization.credits });
    if (updated.length === 0) throw new InsufficientCreditsError(-opts.delta);
    return true;
  });
}
