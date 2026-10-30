import { runVoiceCreditRecovery } from "@/lib/voice-credit-recovery.server";
import { runVoiceAudioRecovery } from "@/lib/voice-audio-recovery.server";
import { runVoiceRecordingRecovery } from "@/lib/voice-recording-recovery.server";

export async function runVoiceRecovery() {
  return { funded: await runVoiceCreditRecovery(), audio: await runVoiceAudioRecovery(), recordings: await runVoiceRecordingRecovery() };
}
