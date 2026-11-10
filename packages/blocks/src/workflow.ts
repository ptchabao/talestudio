import { shotCount, STEP_COSTS, type CostRange, type Format, type Script, type StepCosts } from "@talestudio/core";
import { getBlock } from "./registry";
import type { BlockDefinition, EstimateContext, Stage, WorkflowDefinition, WorkflowNode } from "./types";

export interface ResolvedNode extends WorkflowNode {
  def: BlockDefinition;
  config: Record<string, unknown>;
}

/** Validates the graph once and returns nodes with parsed configs. Throws with every problem found. */
export function resolveWorkflow(wf: WorkflowDefinition): Map<string, ResolvedNode> {
  const errors: string[] = [];
  const nodes = new Map<string, ResolvedNode>();
  for (const n of wf.nodes) {
    if (nodes.has(n.id)) errors.push(`duplicate node ${n.id}`);
    try {
      const def = getBlock(n.block, n.version);
      const parsed = def.configSchema.safeParse(n.config ?? {});
      if (!parsed.success) errors.push(`${n.id}: invalid config (${parsed.error.issues.map((i) => i.message).join(", ")})`);
      nodes.set(n.id, { ...n, def, config: (parsed.success ? parsed.data : {}) as Record<string, unknown> });
    } catch (e) {
      errors.push(`${n.id}: ${(e as Error).message}`);
    }
  }
  for (const e of wf.edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) errors.push(`edge ${e.from}→${e.to} references a missing node`);
  }
  // Every required input must be produced by a direct upstream node.
  for (const n of nodes.values()) {
    const upstream = wf.edges.filter((e) => e.to === n.id).map((e) => nodes.get(e.from)).filter(Boolean) as ResolvedNode[];
    for (const input of n.def.inputs) {
      if (input.optional) continue;
      if (!upstream.some((u) => u.def.outputs.some((o) => o.type === input.type))) errors.push(`${n.id}: input "${input.name}" (${input.type}) is not connected`);
    }
  }
  // Stages: every node in exactly one stage, and no edge may point back to an earlier stage.
  const stageOf = new Map<string, number>();
  wf.stages.forEach((s, i) => s.nodes.forEach((id) => (stageOf.has(id) ? errors.push(`${id} is in two stages`) : stageOf.set(id, i))));
  for (const id of nodes.keys()) if (!stageOf.has(id)) errors.push(`${id} is in no stage`);
  for (const e of wf.edges) if ((stageOf.get(e.from) ?? 0) > (stageOf.get(e.to) ?? 0)) errors.push(`edge ${e.from}→${e.to} goes back to an earlier stage`);
  if (!errors.length) topoLevels(wf, undefined); // throws on cycles
  if (errors.length) throw new Error(`Invalid workflow ${wf.id}@${wf.version}:\n- ${errors.join("\n- ")}`);
  return nodes;
}

/**
 * Nodes grouped into levels that can run in parallel (Kahn's algorithm).
 * With a stage, only that stage's nodes are returned; dependencies on earlier stages count as met.
 */
export function topoLevels(wf: WorkflowDefinition, stage: Stage | undefined): string[][] {
  const scope = new Set(stage ? (wf.stages.find((s) => s.id === stage)?.nodes ?? []) : wf.nodes.map((n) => n.id));
  const indeg = new Map([...scope].map((id) => [id, 0]));
  for (const e of wf.edges) if (scope.has(e.from) && scope.has(e.to)) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const levels: string[][] = [];
  let ready = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  let seen = 0;
  while (ready.length) {
    levels.push(ready.sort());
    seen += ready.length;
    const next: string[] = [];
    for (const id of ready)
      for (const e of wf.edges)
        if (e.from === id && scope.has(e.to)) {
          const d = indeg.get(e.to)! - 1;
          indeg.set(e.to, d);
          if (d === 0) next.push(e.to);
        }
    ready = next;
  }
  if (seen !== scope.size) throw new Error(`Workflow ${wf.id} has a cycle`);
  return levels;
}

export interface WorkflowEstimate {
  credits: Record<Stage, number>;
  totalCredits: number;
  cogs: CostRange;
  byNode: { id: string; block: string; stage: Stage; credits: number; cogs: CostRange }[];
}

/**
 * Price a workflow before running it: TaleTokens per stage (reserved stage by stage) and provider cost,
 * on the primary route unless another cost table is given (DIRECT_STEP_COSTS for the fallback providers).
 */
export function estimateWorkflow(wf: WorkflowDefinition, ctx: EstimateContext, costs: StepCosts = STEP_COSTS): WorkflowEstimate {
  const nodes = resolveWorkflow(wf);
  const credits: Record<Stage, number> = { storyboard: 0, production: 0 };
  const cogs: CostRange = { low: 0, expected: 0, high: 0 };
  const byNode: WorkflowEstimate["byNode"] = [];
  for (const stage of wf.stages) {
    for (const id of stage.nodes) {
      const n = nodes.get(id)!;
      const c = n.def.credits(n.config, ctx);
      const g = n.def.cogs(n.config, ctx, costs);
      credits[stage.id] += c;
      cogs.low += g.low;
      cogs.expected += g.expected;
      cogs.high += g.high;
      byNode.push({ id, block: n.block, stage: stage.id, credits: c, cogs: g });
    }
  }
  return { credits, totalCredits: credits.storyboard + credits.production, cogs, byNode };
}

/**
 * Estimate inputs for a production. Before the script exists we plan on half the shots being spoken;
 * once it exists (i.e. at approval time) the real counts are used, so the production price is exact.
 */
export function estimateContextFor(p: { durationSec: number; formats: Format[]; script?: Script | null; sourceDurationSec?: number | null; highlights?: { selected?: boolean }[] | null }): EstimateContext {
  const clipsCtx = {
    sourceSec: p.sourceDurationSec ?? undefined,
    // Before detection we plan on the default 6 clips; afterwards, the ones the user kept.
    clips: p.highlights ? p.highlights.filter((h) => h.selected !== false).length : p.sourceDurationSec ? 6 : 0,
  };
  if (p.script?.shots.length) {
    const shots = p.script.shots;
    return {
      durationSec: p.durationSec,
      shots: shots.length,
      spokenShots: shots.filter((s) => s.line).length,
      onCameraShots: shots.filter((s) => s.speakerId).length,
      formats: p.formats,
      ...clipsCtx,
    };
  }
  const shots = shotCount(p.durationSec);
  const spoken = Math.ceil(shots * 0.5);
  return { durationSec: p.durationSec, shots, spokenShots: spoken, onCameraShots: spoken, formats: p.formats, ...clipsCtx };
}
