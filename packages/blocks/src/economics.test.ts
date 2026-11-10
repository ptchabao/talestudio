import { DIRECT_STEP_COSTS, FORMATS, IDENTITY_PACK, PAYMENT_FEE, STEP_COSTS, TOKEN_COSTS, type StepCosts } from "@talestudio/core";
import { describe, expect, it } from "vitest";
import type { EstimateContext, Stage } from "./types";
import { estimateWorkflow } from "./workflow";
import { AD_CREATIVE_V1, NEWS_REPORT_V1, PODCAST_CLIPS_V1, PODCAST_EPISODE_V1, STORY_EPISODE_V1 } from "./workflows";

const WORKFLOWS = [STORY_EPISODE_V1, AD_CREATIVE_V1, PODCAST_EPISODE_V1, NEWS_REPORT_V1, PODCAST_CLIPS_V1];

/**
 * The money guard. Every stage a customer can trigger is reserved as one block of TaleTokens, so every stage
 * must pay for itself, on its own, in every shape a production can take:
 *   - primary route (Rodium): healthy margin at expected prices, still positive at worst-case prices;
 *   - fallback route (direct providers, Rodium down or out of balance) at worst-case prices: never a loss.
 * Revenue per token is the public 1 TT = $0.01 minus the payment fee, which is conservative (we sell at 6 FCFA).
 */
const NET_PER_TOKEN = 0.01 * (1 - PAYMENT_FEE);

const generated = WORKFLOWS.filter((w) => w.id !== "podcast-clips");
const clipsWorkflows = WORKFLOWS.filter((w) => w.id === "podcast-clips");

function* generatedShapes(): Generator<EstimateContext> {
  for (let durationSec = 15; durationSec <= 180; durationSec += 15) {
    const shots = durationSec / 5;
    for (const ratio of [0, 0.5, 1]) {
      const spoken = Math.ceil(shots * ratio);
      for (const n of [1, 2, 3]) yield { durationSec, shots, spokenShots: spoken, onCameraShots: spoken, formats: FORMATS.slice(0, n) };
    }
  }
}

function* clipsShapes(): Generator<EstimateContext> {
  for (const sourceSec of [60, 300, 600, 601, 1800, 3600, 7200]) {
    for (const clips of [1, 6, 10]) yield { durationSec: 60, shots: 0, spokenShots: 0, onCameraShots: 0, formats: ["9:16"], sourceSec, clips };
  }
}

function stageMargins(costs: StepCosts, level: "expected" | "high") {
  const rows: { where: string; margin: number }[] = [];
  const check = (wfs: typeof WORKFLOWS, shapes: () => Generator<EstimateContext>) => {
    for (const wf of wfs) {
      for (const ctx of shapes()) {
        const est = estimateWorkflow(wf, ctx, costs);
        for (const stage of ["storyboard", "production"] as Stage[]) {
          const revenue = est.credits[stage] * NET_PER_TOKEN;
          const cost = est.byNode.filter((n) => n.stage === stage).reduce((sum, n) => sum + n.cogs[level], 0);
          rows.push({ where: `${wf.id} ${stage} ${JSON.stringify(ctx)}`, margin: (revenue - cost) / revenue });
        }
      }
    }
  };
  check(generated, generatedShapes);
  check(clipsWorkflows, clipsShapes);
  return rows;
}

const worst = (rows: { where: string; margin: number }[]) => rows.reduce((a, b) => (b.margin < a.margin ? b : a));

describe("TaleToken economics", () => {
  it("keeps ≥45% margin on every stage at expected Rodium prices", () => {
    const w = worst(stageMargins(STEP_COSTS, "expected"));
    expect(w.margin, w.where).toBeGreaterThanOrEqual(0.45);
  });

  it("keeps ≥25% margin on every stage at worst-case Rodium prices", () => {
    const w = worst(stageMargins(STEP_COSTS, "high"));
    expect(w.margin, w.where).toBeGreaterThanOrEqual(0.25);
  });

  it("never loses money, even when every step falls back to the direct providers at their worst prices", () => {
    const w = worst(stageMargins(DIRECT_STEP_COSTS, "high"));
    expect(w.margin, w.where).toBeGreaterThan(0);
  });

  it("prices every TaleStudio Characters generation with ≥45% margin expected and no loss at worst, on both routes", () => {
    const packImages = IDENTITY_PACK.angles.length + IDENTITY_PACK.expressions.length;
    const ops = [
      { tokens: TOKEN_COSTS.characterCandidates, images: 4, checks: 0 },
      { tokens: TOKEN_COSTS.identityPack, images: packImages, checks: packImages },
      { tokens: TOKEN_COSTS.characterExtra, images: 1, checks: 1 },
    ];
    for (const op of ops) {
      const revenue = op.tokens * NET_PER_TOKEN;
      const cost = (k: StepCosts, level: "expected" | "high") => op.images * k.image[level] + op.checks * k.identityCheck[level];
      expect((revenue - cost(STEP_COSTS, "expected")) / revenue).toBeGreaterThanOrEqual(0.45);
      expect((revenue - cost(STEP_COSTS, "high")) / revenue).toBeGreaterThanOrEqual(0.25);
      expect(revenue).toBeGreaterThan(cost(DIRECT_STEP_COSTS, "high"));
    }
  });

  it("prices a single redraw above its cost on both routes", () => {
    const revenue = TOKEN_COSTS.keyframeRedraw * NET_PER_TOKEN;
    expect(revenue).toBeGreaterThan(STEP_COSTS.image.high * 2);
    expect(revenue).toBeGreaterThan(DIRECT_STEP_COSTS.image.high * 2);
  });

  it("prices a 60s episode at the published ~890 TT", () => {
    const wf = WORKFLOWS.find((w) => w.id === "story-episode")!;
    const est = estimateWorkflow(wf, { durationSec: 60, shots: 12, spokenShots: 6, onCameraShots: 6, formats: ["16:9"] });
    expect(est.credits).toEqual({ storyboard: 256, production: 630 });
  });
});
