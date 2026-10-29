import type { Tables } from "@/lib/db-types";
import { terminalVoiceCallDuration } from "@/lib/voice-recovery-duration";
import { enqueueCallStatusSideEffects } from "@/lib/worker/enqueue-call-status.server";
import { runCallStatusSideEffects } from "@/lib/worker/webhook-side-effects.server";

/** Persist the outcome job before billing can remove the recovery candidate. */
export async function settleRecoveredVoiceCall(call: Tables<"call">) {
  const duration = terminalVoiceCallDuration(call.status, call.duration ?? (call.call_duration == null ? null : String(call.call_duration)));
  if (duration === null) throw new Error("Recovered voice call has no final duration");
  const params: Record<string, string> = { CallSid: call.sid, CallStatus: call.status ?? "", CallDuration: String(duration),
    To: call.to ?? "", From: call.from ?? "", Direction: call.direction ?? "", AccountSid: call.account_sid ?? "" };
  if (call.parent_call_sid) params.ParentCallSid = call.parent_call_sid;
  const event = await enqueueCallStatusSideEffects(call, params, "recovery");
  await runCallStatusSideEffects({ callSid: call.sid, event });
}
