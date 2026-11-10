import type { Stage } from "@talestudio/blocks";
import { createActivities } from "./activities";
import { runCharacterJob, runRedraw, runStage } from "./orchestrate";

/**
 * Dev-only runner: the same orchestration, in-process, no Temporal needed.
 * No retries, no durability — a crash mid-run leaves the production in its last status.
 */
export function runStageInline(episodeId: string, workflowKey: string, stage: Stage) {
  void runStage(episodeId, workflowKey, stage, createActivities()).catch((err) => console.error(`[pipeline:inline] ${episodeId} ${stage} failed`, err));
}

export function runCharacterJobInline(jobId: string) {
  void runCharacterJob(jobId, createActivities()).catch((err) => console.error(`[pipeline:inline] character job ${jobId} failed`, err));
}

export function runRedrawInline(episodeId: string, shotIndex: number, requestId: string) {
  void runRedraw(episodeId, shotIndex, requestId, createActivities()).catch((err) => console.error(`[pipeline:inline] redraw ${episodeId}#${shotIndex} failed`, err));
}
