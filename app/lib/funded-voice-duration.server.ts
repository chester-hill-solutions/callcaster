import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { terminalVoiceCallDuration } from "@/lib/voice-recovery-duration";

/** The signature must be checked before normalizing the parsed provider data. */
export function normalizeFundedVoiceDuration(params: Record<string, string>) {
  if (!isTerminalStatus(normalizeProviderStatus(params.CallStatus))) return true;
  const duration = terminalVoiceCallDuration(params.CallStatus ?? null, params.CallDuration ?? null);
  if (duration === null) return false;
  params.CallDuration = String(duration);
  return true;
}
