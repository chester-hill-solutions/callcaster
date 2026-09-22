/**
 * Inbound-call no-input replay counter (#1883).
 *
 * Outbound replays ride the outreach-attempt result JSON; inbound calls have no
 * outreach attempt, so the replay count lives process-locally keyed by
 * `callSid` + block. The redirect loop is short-lived and single-instance, so
 * a module map is honest and avoids a schema change. If inbound runs
 * multi-instance, move the counters into a `call` column or a small store.
 */

const byCall = new Map<string, Map<string, number>>();

export function inboundNoInputReplayCount(
  callSid: string,
  blockId: string,
): number {
  return byCall.get(callSid)?.get(blockId) ?? 0;
}

export function bumpInboundNoInputReplay(callSid: string, blockId: string): number {
  const blocks = byCall.get(callSid) ?? new Map<string, number>();
  const next = (blocks.get(blockId) ?? 0) + 1;
  blocks.set(blockId, next);
  byCall.set(callSid, blocks);
  return next;
}

/** Test seam: clear the process-local counters (outbound route tests only). */
export function resetInboundNoInputReplays(): void {
  byCall.clear();
}