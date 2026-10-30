import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { withVoiceProviderReadBudget } from "@/lib/voice-provider-read-budget";
import { VoiceRecordingBindingError, type VoiceRecordingReceipt } from "@/lib/voice-recording";
import { bindVoiceReservationCallback, VoiceReservationBindingError } from "@/server/voice-reservation-callback.server";
import { findVoiceRecordingOperation } from "@/server/voice-recording-operation.server";
import type { VoiceReservation } from "@/server/voice-credit-reservation.server";

/** A signed recording receipt can precede both Call creation replies and local writes. */
export async function bindEarlyVoiceCustomerRecording(launch: VoiceReservation, receipt: VoiceRecordingReceipt) {
  if (!launch.customer_recording_id || receipt.source !== "OutboundAPI" || receipt.accountSid !== launch.account_sid ||
    receipt.requestUrl !== launch.customer_recording_callback || !launch.audio_connection_id || !launch.send_started_at ||
    launch.state === "released" || launch.provider_sid && launch.provider_sid !== receipt.callSid)
    throw new VoiceRecordingBindingError("Customer recording receipt has no saved Call launch");
  const physical = await withVoiceProviderReadBudget(async requireActive => {
    const client = await createOriginalVoiceAccountClient(launch); requireActive();
    const root = await client.calls(receipt.callSid).fetch(); requireActive();
    if (root.sid !== receipt.callSid || root.accountSid !== launch.account_sid || root.to !== launch.recipient ||
      root.from !== launch.caller_id || root.parentCallSid || root.direction !== "outbound-api")
      throw new VoiceRecordingBindingError("Customer recording does not belong to its physical root");
    return root;
  }, 5000, "Customer recording source verification timed out");
  try {
    await bindVoiceReservationCallback({ reservationId: launch.id, accountSid: physical.accountSid, callSid: physical.sid,
      to: physical.to, from: physical.from, direction: physical.direction, parentCallSid: physical.parentCallSid,
      requestUrl: receipt.requestUrl, entryPoint: "recording", recordingOperationId: launch.customer_recording_id });
  } catch (error) {
    if (error instanceof VoiceReservationBindingError) throw new VoiceRecordingBindingError(error.message);
    throw error;
  }
  const owner = await findVoiceRecordingOperation(launch.customer_recording_id);
  if (!owner) throw new Error("Accepted customer recording registration needs recovery");
  return owner;
}
