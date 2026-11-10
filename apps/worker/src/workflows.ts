import type { Stage } from "@talestudio/blocks";
import type { Activities } from "@talestudio/pipeline";
import { runCharacterJob, runRedraw, runStage } from "@talestudio/pipeline/orchestrate";
import { CancellationScope, isCancellation, proxyActivities } from "@temporalio/workflow";

const NON_RETRYABLE = ["NonRetryableError", "PlanLimitError", "InsufficientCreditsError", "ScriptRefusedError"];

/** Cheap bookkeeping activities: fast timeout, many retries. */
const bookkeeping = proxyActivities<Activities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 10, nonRetryableErrorTypes: NON_RETRYABLE },
});

/** Block items call GPU providers: queues can take minutes; back off hard on rate limits. */
const generation = proxyActivities<Activities>({
  startToCloseTimeout: "30 minutes",
  retry: { initialInterval: "10 seconds", backoffCoefficient: 2, maximumInterval: "5 minutes", maximumAttempts: 5, nonRetryableErrorTypes: NON_RETRYABLE },
});

const hooks = { nonCancellable: <T>(fn: () => Promise<T>) => CancellationScope.nonCancellable(fn), isCancellation };

/** One stage of a production's pinned workflow (storyboard, then production after approval). */
export async function stageWorkflow(episodeId: string, workflowKey: string, stage: Stage) {
  return runStage(
    episodeId,
    workflowKey,
    stage,
    {
      reserveStage: bookkeeping.reserveStage,
      refundReservation: bookkeeping.refundReservation,
      setStatus: bookkeeping.setStatus,
      finish: bookkeeping.finish,
      startBlock: bookkeeping.startBlock,
      endBlock: bookkeeping.endBlock,
      runBlockItem: generation.runBlockItem,
    },
    hooks,
  );
}

export async function characterJobWorkflow(jobId: string) {
  return runCharacterJob(jobId, { reserveCharacterJob: bookkeeping.reserveCharacterJob, generateCharacterJob: generation.generateCharacterJob, finishCharacterJob: bookkeeping.finishCharacterJob }, hooks);
}

export async function redrawWorkflow(episodeId: string, shotIndex: number, requestId: string) {
  return runRedraw(episodeId, shotIndex, requestId, { prepareRedraw: bookkeeping.prepareRedraw, refundReservation: bookkeeping.refundReservation, drawKeyframe: generation.drawKeyframe }, hooks);
}
