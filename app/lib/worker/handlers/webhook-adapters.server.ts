import {
  runCallStatusSideEffects,
  runRecordingSideEffects,
  runSmsStatusSideEffects,
} from "@/lib/worker/webhook-side-effects.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
// `sidAndTwilioParamsSchema` moved to job-registry.server.ts in #1239 A3 so
// job-params.server.ts (schema-only) can build these registrations without
// depending on this file — see that module's doc comment for why.
import type { SidAndTwilioParams } from "@/lib/worker/job-registry.server";

export async function callStatusSideEffectsHandler(
  job: ClaimedJobRow,
  params: SidAndTwilioParams,
): Promise<unknown> {
  return runCallStatusSideEffects({
    callSid: params.sid,
    twilioParams: params.twilioParams,
  });
}

export async function smsStatusSideEffectsHandler(
  job: ClaimedJobRow,
  params: SidAndTwilioParams,
): Promise<unknown> {
  return runSmsStatusSideEffects({
    messageSid: params.sid,
    twilioParams: params.twilioParams,
  });
}

export async function recordingSideEffectsHandler(
  job: ClaimedJobRow,
  params: SidAndTwilioParams,
): Promise<unknown> {
  return runRecordingSideEffects({
    callSid: params.sid,
    twilioParams: params.twilioParams,
  });
}
