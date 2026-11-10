import { describe, expect, it, vi } from "vitest";
import { ScriptRefusedError } from "./anthropic";
import { withFallback } from "./fallback";
import { RodiumError } from "./rodium";

const provider = (impl: () => Promise<string>) => ({ run: vi.fn(impl) });

describe("withFallback", () => {
  it("uses Rodium when it answers", async () => {
    const primary = provider(async () => "rodium");
    const backup = provider(async () => "direct");
    await expect(withFallback("t", primary, backup).run()).resolves.toBe("rodium");
    expect(backup.run).not.toHaveBeenCalled();
  });

  it("falls back on an empty wallet, an outage or a timeout", async () => {
    for (const err of [new RodiumError(402, "insufficient_balance", "x"), new RodiumError(503, "maintenance_active", "x"), new RodiumError(504, "timeout", "x"), new TypeError("fetch failed")]) {
      const backup = provider(async () => "direct");
      const wrapped = withFallback("t", provider(() => Promise.reject(err)), backup);
      await expect(wrapped.run()).resolves.toBe("direct");
    }
  });

  it("does not replay a refusal unless another route can help", async () => {
    const backup = provider(async () => "direct");
    await expect(withFallback("t", provider(() => Promise.reject(new ScriptRefusedError("no"))), backup).run()).rejects.toThrow("no");
    expect(backup.run).not.toHaveBeenCalled();
    await expect(withFallback("t", provider(() => Promise.reject(new ScriptRefusedError("no", true))), backup).run()).resolves.toBe("direct");
  });

  it("surfaces the Rodium error when no direct provider is configured", async () => {
    const err = new RodiumError(402, "insufficient_balance", "empty wallet");
    await expect(withFallback("t", provider(() => Promise.reject(err)), null).run()).rejects.toBe(err);
  });
});
