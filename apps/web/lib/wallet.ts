import "server-only";
import { tokensForXof, TOPUP, validTopupXof } from "@talestudio/core";
import { and, applyCredits, db, eq, schema } from "@talestudio/db";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { checkPayment, cinetpayEnabled, initPayment } from "./cinetpay";
import { appUrl } from "./url";
import { fail, invalidInput, type Failure } from "./validation";
import type { WorkspaceContext } from "./workspace";

/** Start a top-up: record the pending payment (amount and tokens fixed now), then hand over to CinetPay. */
export async function startTopup(ws: WorkspaceContext, raw: unknown): Promise<{ ok: true; url: string } | Failure> {
  const parsed = z.object({ amountXof: z.number() }).safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  const amountXof = validTopupXof(parsed.data.amountXof);
  if (!amountXof) return fail(400, "invalid_amount", "Amount out of range", { min: TOPUP.minXof, max: TOPUP.maxXof });
  if (!cinetpayEnabled()) return fail(503, "billing_disabled", "Payments are not configured on this environment");

  // CinetPay wants an alphanumeric transaction id, unique per site.
  const transactionId = `TS${Date.now().toString(36)}${randomBytes(5).toString("hex")}`.toUpperCase();
  const tokens = tokensForXof(amountXof);
  await db.insert(schema.payment).values({ organizationId: ws.org.id, userId: ws.user.id, transactionId, amountXof, tokens });
  try {
    const url = await initPayment({
      transactionId,
      amountXof,
      description: `Recharge TaleStudio ${tokens} TT`,
      notifyUrl: `${appUrl()}/api/payments/cinetpay/notify`,
      returnUrl: `${appUrl()}/api/payments/cinetpay/return?tx=${transactionId}`,
      customer: { id: ws.user.id, name: ws.user.name, email: ws.user.email },
    });
    return { ok: true, url };
  } catch (err) {
    console.error(`[wallet] ${transactionId}`, err);
    await db.update(schema.payment).set({ status: "refused" }).where(eq(schema.payment.transactionId, transactionId));
    return fail(502, "payment_unavailable", "The payment provider is unavailable");
  }
}

/**
 * Settle a payment from CinetPay's own status (never from the notification body). Tokens are credited once
 * per transaction, and only if CinetPay confirms at least the amount we recorded, in FCFA.
 */
export async function settlePayment(transactionId: string): Promise<"accepted" | "refused" | "pending" | "unknown"> {
  const p = await db.query.payment.findFirst({ where: eq(schema.payment.transactionId, transactionId) });
  if (!p) return "unknown";
  if (p.status !== "pending") return p.status;
  const s = await checkPayment(transactionId);
  if (s.status === "PENDING") return "pending";
  const pending = and(eq(schema.payment.id, p.id), eq(schema.payment.status, "pending"));
  const details = { paymentMethod: s.paymentMethod, operatorId: s.operatorId, completedAt: new Date() };
  if (s.status === "ACCEPTED" && s.currency === TOPUP.currency && s.amountXof >= p.amountXof) {
    // Credit first (idempotent), then close the payment: a crash in between is repaired by the next settle.
    await applyCredits({ organizationId: p.organizationId, actorId: p.userId, delta: p.tokens, reason: "topup", idempotencyKey: `cinetpay:${transactionId}` });
    await db.update(schema.payment).set({ status: "accepted", ...details }).where(pending);
    return "accepted";
  }
  if (s.status === "ACCEPTED") console.error(`[wallet] ${transactionId} accepted for ${s.amountXof} ${s.currency}, expected ${p.amountXof} XOF: not credited`);
  await db.update(schema.payment).set({ status: "refused", ...details }).where(pending);
  return "refused";
}
