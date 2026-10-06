/** Completed and cancelled legs stop; these provider outcomes permit another turn. */
export function needsPredictiveTerminalContinuation(
  status: string | null | undefined,
) {
  return status === "failed" || status === "busy" || status === "no-answer";
}
