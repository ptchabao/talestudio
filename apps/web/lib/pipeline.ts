import "server-only";
import type { Stage } from "@talestudio/blocks";
import { runCharacterJobInline, runRedrawInline, runStageInline, TASK_QUEUE } from "@talestudio/pipeline";
import { Client, Connection } from "@temporalio/client";

let client: Promise<Client> | undefined;

function temporal() {
  client ??= Connection.connect({
    address: process.env.TEMPORAL_ADDRESS!,
    tls: process.env.TEMPORAL_API_KEY ? true : undefined,
    apiKey: process.env.TEMPORAL_API_KEY || undefined,
  }).then((connection) => new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? "default" }));
  return client;
}

/**
 * Production: durable Temporal workflow (retries, timeouts, compensation).
 * Dev without TEMPORAL_ADDRESS: same orchestration, in-process.
 */
export async function startStage(episodeId: string, workflowKey: string, stage: Stage, attempt: number): Promise<string> {
  const workflowId = `episode-${episodeId}-${stage}-${attempt}`;
  if (!process.env.TEMPORAL_ADDRESS) {
    runStageInline(episodeId, workflowKey, stage);
    return `inline:${workflowId}`;
  }
  await (await temporal()).workflow.start("stageWorkflow", { taskQueue: TASK_QUEUE, workflowId, args: [episodeId, workflowKey, stage] });
  return workflowId;
}

export async function startRedraw(episodeId: string, shotIndex: number, requestId: string) {
  if (!process.env.TEMPORAL_ADDRESS) return runRedrawInline(episodeId, shotIndex, requestId);
  await (await temporal()).workflow.start("redrawWorkflow", { taskQueue: TASK_QUEUE, workflowId: `redraw-${episodeId}-${shotIndex}-${requestId}`, args: [episodeId, shotIndex, requestId] });
}

/** One TaleStudio Characters generation (face proposals, identity pack, extra outfit or expression). */
export async function startCharacterJob(jobId: string) {
  if (!process.env.TEMPORAL_ADDRESS) return runCharacterJobInline(jobId);
  await (await temporal()).workflow.start("characterJobWorkflow", { taskQueue: TASK_QUEUE, workflowId: `character-job-${jobId}`, args: [jobId] });
}

export async function cancelRun(workflowId: string) {
  if (workflowId.startsWith("inline:")) return false;
  await (await temporal()).workflow.getHandle(workflowId).cancel();
  return true;
}
