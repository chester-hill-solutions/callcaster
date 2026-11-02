import { VoiceAudioBindingError } from "@/lib/voice-audio-connection";
import { findVoiceAudioConnection, saveVoiceAudioProvider, withVoiceAudioConnection, type VoiceAudioConnection } from "./voice-audio-connection.server";

export type VoiceAudioProviderIdentity = {
  connectionId: string;
  event: "voice" | "status";
  requestUrl: string;
  accountSid: string;
  callSid: string;
  to: string;
  from: string;
  direction: string;
  parentCallSid: string | null;
};

function matchesAudioReceipt(row: VoiceAudioConnection, input: VoiceAudioProviderIdentity) {
  const callback = input.event === "voice" ? row.voice_url : row.status_callback;
  return input.requestUrl === callback && input.accountSid === row.account_sid && input.to === row.destination &&
    input.from === row.caller_id && input.direction === "outbound-api" && !input.parentCallSid;
}

/** Authenticate the provider signature before binding its immutable send receipt. */
export async function bindVoiceAudioProviderReceipt(input: VoiceAudioProviderIdentity) {
  if (!/^CA[0-9a-f]{32}$/i.test(input.callSid)) throw new VoiceAudioBindingError("Invalid agent audio provider SID");
  const row = await findVoiceAudioConnection(input.connectionId);
  if (!row) throw new VoiceAudioBindingError("Agent audio connection not found");
  return withVoiceAudioConnection(row, async (tx, current) => {
    if (!matchesAudioReceipt(current, input)) throw new VoiceAudioBindingError("Agent audio callback does not match its send");
    return saveVoiceAudioProvider(tx, current, input.callSid);
  });
}
