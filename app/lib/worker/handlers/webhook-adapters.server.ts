import {
  runCallStatusSideEffects,
  runRecordingSideEffects,
  runSmsStatusSideEffects,
} from "@/lib/worker/webhook-side-effects.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
import { runVoiceRecordingCopy } from "@/lib/voice-recording-copy.server";
import { runVoiceParentRecordingPreparation } from "@/lib/voice-parent-recording.server";
import type { z } from "zod";
import type { recordingSideEffectsParams } from "@/lib/worker/job-params.server";
// `sidAndTwilioParamsSchema` moved to job-registry.server.ts in #1239 A3 so
// job-params.server.ts (schema-only) can build these registrations without
// depending on this file — see that module's doc comment for why.
import type {
  SidAndTwilioParams,
  VoiceSideEffectsParams,
} from "@/lib/worker/job-registry.server";

export async function callStatusSideEffectsHandler(
  job: ClaimedJobRow,
  params: VoiceSideEffectsParams,
): Promise<unknown> {
  return runCallStatusSideEffects({
    callSid: params.sid,
    event: params.event,
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
  params: z.infer<typeof recordingSideEffectsParams>,
): Promise<unknown> {
  if ("parentCaptureConnectionId" in params) {
    if (!job.workspace_id) throw new Error("Parent capture job has no workspace");
    return runVoiceParentRecordingPreparation(job.workspace_id, params.parentCaptureConnectionId);
  }
  if ("recordingOperationId" in params) {
    if (!job.workspace_id) throw new Error("Recording part job has no workspace");
    return runVoiceRecordingCopy(job.workspace_id, params.recordingOperationId, params.leaseToken);
  }
  return runRecordingSideEffects({
    callSid: params.sid,
    event: params.event,
  });
}
