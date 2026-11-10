/**
 * Generic workflow runner, written once.
 * - In production it runs inside Temporal workflows (apps/worker/src/workflows.ts) with activities proxied.
 * - In dev it runs in-process with the real activity functions (src/inline.ts).
 * It must stay deterministic: no I/O, no Date.now(); the block registry it reads is pure data.
 */
import { getWorkflow, resolveWorkflow, topoLevels, type Stage } from "@talestudio/blocks";
import type { EpisodeStatus } from "@talestudio/core";
import type { Activities } from "./activities";

export interface OrchestrateHooks {
  /** Run compensation even if the workflow is being cancelled (Temporal: CancellationScope.nonCancellable). */
  nonCancellable?: <T>(fn: () => Promise<T>) => Promise<T>;
  isCancellation?: (err: unknown) => boolean;
}

type EngineActivities = Pick<Activities, "reserveStage" | "refundReservation" | "setStatus" | "finish" | "startBlock" | "runBlockItem" | "endBlock">;

/** Progress bar share of each stage: the storyboard is quick, production is most of the wait. */
const STAGE_SPAN: Record<Stage, [number, number]> = { storyboard: [0, 0.25], production: [0.25, 1] };

/** Bound fan-out so one long production cannot exhaust provider rate limits for everyone else. */
async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

/** The root cause's message: Temporal wraps activity errors ("Activity task failed") around the real one. */
const message = (err: unknown): string => {
  let e: unknown = err;
  while (e instanceof Error && e.cause instanceof Error) e = e.cause;
  return e instanceof Error ? e.message : String(e);
};

export async function runStage(episodeId: string, workflowKey: string, stage: Stage, a: EngineActivities, hooks: OrchestrateHooks = {}): Promise<EpisodeStatus> {
  const guard = hooks.nonCancellable ?? ((fn) => fn());
  const wf = getWorkflow(workflowKey);
  const nodes = resolveWorkflow(wf);
  const levels = topoLevels(wf, stage);

  let reservation: Awaited<ReturnType<EngineActivities["reserveStage"]>>;
  try {
    reservation = await a.reserveStage(episodeId, stage);
  } catch (err) {
    // Nothing was charged: just surface the reason (no credits, plan limit) on the production.
    await guard(() => a.finish(episodeId, "failed", message(err)));
    throw err;
  }

  const [from, to] = STAGE_SPAN[stage];
  try {
    for (const [li, level] of levels.entries()) {
      await Promise.all(
        level.map(async (nodeId) => {
          const n = nodes.get(nodeId)!;
          await a.setStatus(episodeId, n.def.status, from + ((to - from) * li) / levels.length);
          const items = await a.startBlock(episodeId, { nodeId, block: n.block, version: n.version, stage });
          try {
            await mapLimit(items, reservation.concurrency, (item) => a.runBlockItem(episodeId, nodeId, n.def.executor, item));
          } catch (err) {
            await guard(() => a.endBlock(episodeId, nodeId, "failed", message(err)));
            throw err;
          }
          await a.endBlock(episodeId, nodeId, "completed");
        }),
      );
    }
    const done: EpisodeStatus = stage === "storyboard" ? "storyboard_ready" : "completed";
    await a.finish(episodeId, done);
    return done;
  } catch (err) {
    const canceled = hooks.isCancellation?.(err) ?? false;
    await guard(async () => {
      await a.refundReservation(episodeId, reservation.key, reservation.costUsd);
      await a.finish(episodeId, canceled ? "canceled" : "failed", message(err));
    });
    throw err;
  }
}

type CharacterActivities = Pick<Activities, "reserveCharacterJob" | "generateCharacterJob" | "finishCharacterJob">;

/** One TaleStudio Characters generation: reserve, generate, then close (refunding on failure). */
export async function runCharacterJob(jobId: string, a: CharacterActivities, hooks: OrchestrateHooks = {}) {
  const guard = hooks.nonCancellable ?? ((fn) => fn());
  try {
    await a.reserveCharacterJob(jobId);
  } catch (err) {
    await guard(() => a.finishCharacterJob(jobId, message(err)));
    throw err;
  }
  try {
    await a.generateCharacterJob(jobId);
  } catch (err) {
    await guard(() => a.finishCharacterJob(jobId, message(err)));
    throw err;
  }
  await a.finishCharacterJob(jobId, null);
}

type RedrawActivities = Pick<Activities, "prepareRedraw" | "drawKeyframe" | "refundReservation">;

/** Redraw one storyboard frame after the user edited its shot: charge, regenerate, refund on failure. */
export async function runRedraw(episodeId: string, shotIndex: number, requestId: string, a: RedrawActivities, hooks: OrchestrateHooks = {}) {
  const guard = hooks.nonCancellable ?? ((fn) => fn());
  const key = await a.prepareRedraw(episodeId, shotIndex, requestId);
  try {
    await a.drawKeyframe(episodeId, shotIndex);
  } catch (err) {
    await guard(() => a.refundReservation(episodeId, key));
    throw err;
  }
}
