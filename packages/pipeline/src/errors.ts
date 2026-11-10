/**
 * Errors the orchestrator must not retry. Temporal matches on `error.name`,
 * so the worker lists these names in `nonRetryableErrorTypes`.
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}
export class PlanLimitError extends NonRetryableError {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}
export const NON_RETRYABLE_ERROR_NAMES = ["NonRetryableError", "PlanLimitError", "InsufficientCreditsError", "ScriptRefusedError"];
