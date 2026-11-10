import { workflowKey, STORY_EPISODE_V1 } from "@talestudio/blocks";
import { describe, expect, it, vi } from "vitest";
import type { Activities } from "./activities";
import { runRedraw, runStage } from "./orchestrate";

const WF = workflowKey(STORY_EPISODE_V1);

function fake(overrides: Partial<Record<keyof Activities, unknown>> = {}) {
  const calls: string[] = [];
  const a = {
    reserveStage: vi.fn(async (_id: string, stage: string) => (calls.push(`reserve:${stage}`), { key: `k-${stage}`, credits: 1, concurrency: 2, costUsd: 0 })),
    refundReservation: vi.fn(async (_id: string, key: string) => void calls.push(`refund:${key}`)),
    setStatus: vi.fn(async () => {}),
    finish: vi.fn(async (_id: string, status: string, err?: string) => void calls.push(`finish:${status}${err ? `:${err}` : ""}`)),
    startBlock: vi.fn(async (_id: string, n: { nodeId: string }) => (calls.push(`start:${n.nodeId}`), n.nodeId === "keyframes" || n.nodeId === "animate" ? [0, 1, 2] : [0])),
    runBlockItem: vi.fn(async (_id: string, nodeId: string, _e: string, item: number) => void calls.push(`run:${nodeId}:${item}`)),
    endBlock: vi.fn(async (_id: string, nodeId: string, status: string) => void calls.push(`end:${nodeId}:${status}`)),
    prepareRedraw: vi.fn(async () => (calls.push("charge"), "redraw-key")),
    drawKeyframe: vi.fn(async () => void calls.push("draw")),
    ...overrides,
  } as unknown as Activities;
  return { a, calls };
}

describe("runStage", () => {
  it("storyboard stage runs script → cast → keyframes and stops for approval", async () => {
    const { a, calls } = fake();
    expect(await runStage("ep", WF, "storyboard", a)).toBe("storyboard_ready");
    expect(calls.filter((c) => c.startsWith("start:"))).toEqual(["start:script", "start:cast", "start:keyframes"]);
    expect(calls.filter((c) => c.startsWith("run:keyframes"))).toHaveLength(3);
    expect(calls.some((c) => c.startsWith("start:animate"))).toBe(false);
  });

  it("production stage reserves its own credits and finishes completed", async () => {
    const { a, calls } = fake();
    expect(await runStage("ep", WF, "production", a)).toBe("completed");
    expect(calls[0]).toBe("reserve:production");
    expect(calls.at(-1)).toBe("finish:completed");
  });

  it("marks the failing block, refunds the stage and fails the production", async () => {
    const { a, calls } = fake({
      runBlockItem: async (_id: string, nodeId: string) => {
        if (nodeId === "animate") throw new Error("provider down");
      },
    });
    await expect(runStage("ep", WF, "production", a)).rejects.toThrow("provider down");
    expect(calls).toContain("end:animate:failed");
    expect(calls).toContain("refund:k-production");
    expect(calls.at(-1)).toBe("finish:failed:provider down");
  });

  it("does not refund when the reservation itself fails", async () => {
    const { a, calls } = fake({ reserveStage: async () => { throw new Error("Insufficient credits"); } });
    await expect(runStage("ep", WF, "production", a)).rejects.toThrow();
    expect(calls.some((c) => c.startsWith("refund"))).toBe(false);
    expect(calls.at(-1)).toBe("finish:failed:Insufficient credits");
  });
});

describe("runRedraw", () => {
  it("refunds the redraw credit when drawing fails", async () => {
    const { a, calls } = fake({ drawKeyframe: async () => { throw new Error("nsfw filter"); } });
    await expect(runRedraw("ep", 3, "r1", a)).rejects.toThrow();
    expect(calls).toEqual(["charge", "refund:redraw-key"]);
  });
});
