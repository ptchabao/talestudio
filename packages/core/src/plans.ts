/**
 * TaleStudio is prepaid pay-as-you-go: a workspace tops up a TaleToken (TT) wallet with any amount and every
 * operation is priced in TT (see TOKEN_COSTS). There is no free tier, no subscription and no monthly grant:
 * one account type, every studio, limited only by the wallet balance.
 */
export type PlanId = "payg";

export interface Plan {
  id: PlanId;
  canGenerateVideo: boolean;
  maxDurationSec: number;
  /** Days we keep raw intermediate assets (clips, audio). Finals are kept for the life of the account. */
  rawRetentionDays: number;
  concurrentJobs: number;
  watermark: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  payg: { id: "payg", canGenerateVideo: true, maxDurationSec: 180, rawRetentionDays: 14, concurrentJobs: 3, watermark: false },
};

/**
 * Tokens given once to every new personal workspace. Deliberately below the cheapest storyboard (139 TT):
 * it lets people see the wallet work (e.g. a redraw) but every real production is paid.
 */
export const WELCOME_TOKENS = 50;

/**
 * Wallet top-ups, paid in FCFA through CinetPay (Mobile Money and cards).
 * The public convention is 1 $ ≈ 100 TT. We sell 1 TT for 6 FCFA, i.e. 600 FCFA per dollar against a market
 * rate around 565: the ~6% spread covers CinetPay's fee and EUR/USD moves on providers billed in dollars.
 * Rodium bills in RODI (= FCFA), so the main route carries no currency risk at all.
 */
export const TOPUP = {
  currency: "XOF",
  xofPerToken: 6,
  /** Small top-ups are fine for Mobile Money, but below this a storyboard is out of reach. */
  minXof: 2000,
  maxXof: 1_000_000,
  /** CinetPay only accepts XOF amounts that are multiples of 5. */
  stepXof: 5,
  presetsXof: [2000, 5000, 10000, 25000],
} as const;

/** Worst-case payment processing fee we budget for on every top-up (CinetPay charges ~2.5–3.5%). */
export const PAYMENT_FEE = 0.04;

/** Tokens credited for a top-up amount (rounded down: we never credit value we did not receive). */
export function tokensForXof(amountXof: number): number {
  return Math.floor(amountXof / TOPUP.xofPerToken);
}

/** Normalise a requested amount to what CinetPay accepts, or null if it is out of range. */
export function validTopupXof(amountXof: number): number | null {
  if (!Number.isFinite(amountXof)) return null;
  const rounded = Math.round(amountXof / TOPUP.stepXof) * TOPUP.stepXof;
  return rounded >= TOPUP.minXof && rounded <= TOPUP.maxXof ? rounded : null;
}
