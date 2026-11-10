import { describe, expect, it } from "vitest";
import { episodeTokenCost, storyboardTokens } from "./credits";
import { DEFAULT_EPISODE } from "./costs";
import { PAYMENT_FEE, TOPUP, tokensForXof, validTopupXof, WELCOME_TOKENS } from "./plans";

/** Stage-by-stage margins on every workflow live in packages/blocks/src/economics.test.ts. */
describe("wallet", () => {
  it("sells a token for at least $0.01 at the market rate, so the 1 $ ≈ 100 TT promise never undercuts costs", () => {
    const marketXofPerUsd = 565;
    expect(TOPUP.xofPerToken / marketXofPerUsd).toBeGreaterThanOrEqual(0.01);
    // The spread over the public rate must at least absorb the payment fee.
    expect(TOPUP.xofPerToken / marketXofPerUsd / 0.01 - 1).toBeGreaterThanOrEqual(PAYMENT_FEE);
  });

  it("credits whole tokens, rounded down", () => {
    expect(tokensForXof(2000)).toBe(333);
    expect(tokensForXof(5)).toBe(0);
  });

  it("accepts only CinetPay-compatible amounts within limits", () => {
    expect(validTopupXof(1999)).toBe(2000);
    expect(validTopupXof(2003)).toBe(2005);
    expect(validTopupXof(1000)).toBeNull();
    expect(validTopupXof(2_000_000)).toBeNull();
    expect(validTopupXof(Number.NaN)).toBeNull();
  });

  it("lets the minimum top-up buy at least a short storyboard", () => {
    expect(tokensForXof(TOPUP.minXof)).toBeGreaterThanOrEqual(storyboardTokens(3));
  });

  it("gives welcome tokens that cannot pay for any production on their own", () => {
    expect(WELCOME_TOKENS).toBeLessThan(storyboardTokens(3));
  });

  it("prices a 60s episode ~890 TT", () => {
    expect(episodeTokenCost({ ...DEFAULT_EPISODE, mode: "full" })).toBe(886);
    expect(episodeTokenCost({ ...DEFAULT_EPISODE, mode: "storyboard" })).toBe(256);
  });
});
