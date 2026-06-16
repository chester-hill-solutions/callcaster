/**
 * Canonical client-side call session phases for Twilio Voice SDK sessions.
 * This models local softphone state — not Twilio Conference participant hold.
 */
export const CALL_SESSION_PHASES = [
  "idle",
  "ringing",
  "dialing",
  "connected",
  "connected_with_held",
  "completed",
  "failed",
] as const;

export type CallSessionPhase = typeof CALL_SESSION_PHASES[number];

/** Operator mic intent passed from call session owner to audio device hooks. */
export type MicCoordinator = {
  isMicMuted: boolean;
  setMicMuted: (muted: boolean) => void;
};

export function deriveCallSessionPhase(
  activeCall: unknown | null,
  incomingCall: unknown | null,
  heldCount: number,
  callState: string,
): CallSessionPhase {
  if (callState === "failed") return "failed";
  if (incomingCall) return "ringing";
  if (callState === "dialing") return "dialing";
  if (activeCall && heldCount > 0) return "connected_with_held";
  if (activeCall || callState === "connected") return "connected";
  if (callState === "completed") return "completed";
  return "idle";
}
