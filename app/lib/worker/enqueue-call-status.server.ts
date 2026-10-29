import type { Tables } from "@/lib/db-types";
import { parseTwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { CALL_STATUS_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";

export async function enqueueCallStatusSideEffects(
  call: Tables<"call">, params: Record<string, string>, source: "callback" | "recovery" = "callback",
) {
  const event = parseTwilioVoiceCallback(params);
  const status = String(call.status ?? params.CallStatus ?? params.call_status ?? "unknown").trim().toLowerCase();
  const prefix = source === "callback" ? "call_status_side_effects" : "voice_credit_recovery_side_effects";
  await enqueueRegisteredJob({ type: CALL_STATUS_SIDE_EFFECTS_JOB_TYPE, workspaceId: call.workspace,
    idempotencyKey: `${prefix}:${call.sid}:${status || "unknown"}`,
    params: { sid: call.sid, twilioParams: params, event },
  });
  return event;
}
