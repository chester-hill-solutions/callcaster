import {
  runCallStatusSideEffects,
  runRecordingSideEffects,
  runSmsStatusSideEffects,
} from "@/lib/worker/webhook-side-effects.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
import { requireRecordParam, requireStringParam } from "./shared.server";

function requireSidAndTwilioParams(
  job: ClaimedJobRow,
  sidKey: "callSid" | "messageSid",
  label: string,
): { sid: string; twilioParams: Record<string, string> } {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const sid = requireStringParam(params, sidKey);
  const twilioParams = requireRecordParam(params, "twilioParams");
  if (!sid || !twilioParams) {
    throw new Error(`${label}: missing ${sidKey} or twilioParams`);
  }
  return { sid, twilioParams };
}

export async function callStatusSideEffectsHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const { sid, twilioParams } = requireSidAndTwilioParams(
    job,
    "callSid",
    "call_status_side_effects",
  );
  return runCallStatusSideEffects({ callSid: sid, twilioParams });
}

export async function smsStatusSideEffectsHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const { sid, twilioParams } = requireSidAndTwilioParams(
    job,
    "messageSid",
    "sms_status_side_effects",
  );
  return runSmsStatusSideEffects({ messageSid: sid, twilioParams });
}

export async function recordingSideEffectsHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const { sid, twilioParams } = requireSidAndTwilioParams(
    job,
    "callSid",
    "recording_side_effects",
  );
  return runRecordingSideEffects({ callSid: sid, twilioParams });
}
