import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";

/** Unanswered provider calls may omit duration; answered calls need a value. */
export function terminalVoiceCallDuration(rawStatus: string | null, duration: string | null) {
  const status = normalizeProviderStatus(rawStatus);
  if (!isTerminalStatus(status)) return null;
  if (status === "canceled") return 0;
  if (duration === null || duration.trim() === "") return status === "completed" ? null : 0;
  const seconds = Number(duration);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}
