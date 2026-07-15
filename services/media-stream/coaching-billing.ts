/**
 * Billing debits raised by the live media pipeline.
 *
 * ## Boundary note (v1): intentional in-process coupling with the app
 *
 * The media-stream service is a separate Railway process (ADR-0030) but ships in
 * the same image and runs from the same source tree, so it imports the app's
 * billing primitives directly via the `@/` alias — TOP-LEVEL, not through
 * `await import()`. The dynamic imports this module replaces guarded nothing:
 * there is no cycle (`@/lib/pricing` only re-exports `shared/pricing`) and no
 * bundling constraint (the service is not part of the app build; Bun resolves
 * `@/` from tsconfig paths, and `db-writer.ts` has always imported
 * `@/server/admin-db` at top level). Deferring them only hid the debits from
 * static analysis — which is exactly how `scripts/check-credit-write-paths.mjs`
 * came to miss this file. That script now scans `services/` too.
 *
 * Accepted for v1: the service reaches into `@/lib/*` service-role modules. If
 * this ever needs to run out-of-process from the app, the seam to cut is here
 * and in `db-writer.ts` — the rest of the engine is already effect-free.
 */
import { debitAmountFromCredits } from "@/lib/pricing";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import {
  coachingCueKey,
  liveTranscriptionKey,
} from "../../shared/billing-keys";
import {
  COACHING_CUE_CREDITS,
  TRANSCRIPTION_RATE_CREDITS,
} from "../../shared/billing-rates";

/** Charge for one LLM-generated coaching cue, keyed by its persisted row id. */
export async function billCoachingCue(args: {
  workspaceId: string;
  callSid: string;
  eventId: string;
}): Promise<void> {
  await insertTransactionHistoryIdempotent({
    workspaceId: args.workspaceId,
    type: "DEBIT",
    amount: debitAmountFromCredits(COACHING_CUE_CREDITS),
    note: `Coaching cue ${args.callSid}`,
    idempotencyKey: coachingCueKey(args.callSid, args.eventId),
    callSid: args.callSid,
  });
}

/** Credits owed for a realtime STT session of `durationMs`. Exported for tests. */
export function liveTranscriptionCredits(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.ceil((durationMs / 60_000) * TRANSCRIPTION_RATE_CREDITS);
}

/**
 * Charge for a realtime STT session, billed from the STT clock.
 *
 * Follows the STT lifecycle, NOT the coaching lifecycle: a transcription-only
 * workspace opens a stream and must be billed for it even though no coaching
 * session exists. Previously this lived inside `finalizeCoachingSession` and
 * measured the coaching state's clock, so those workspaces ran STT for free.
 *
 * A session that opened but accrued no billable time writes nothing — never a
 * zero or negative debit.
 */
export async function billLiveTranscription(args: {
  workspaceId: string;
  callSid: string;
  durationMs: number;
}): Promise<{ billed: boolean; credits: number }> {
  const credits = liveTranscriptionCredits(args.durationMs);
  if (credits <= 0) {
    return { billed: false, credits: 0 };
  }

  await insertTransactionHistoryIdempotent({
    workspaceId: args.workspaceId,
    type: "DEBIT",
    amount: debitAmountFromCredits(credits),
    note: `Live transcription ${args.callSid}`,
    idempotencyKey: liveTranscriptionKey(args.callSid),
    callSid: args.callSid,
  });

  return { billed: true, credits };
}
