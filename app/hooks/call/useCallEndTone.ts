import { useEffect, useRef } from "react";
import { createTonePlayer } from "@/lib/call-tone-player.client";

// Busy-signal frequencies read universally as "the call is over": two short
// bursts rather than a continuous busy so it feels like feedback, not an error.
const END_TONE_FREQUENCIES_HZ = [480, 620] as const;
const END_TONE_ON_MS = 220;
const END_TONE_GAP_MS = 180;
const END_TONE_BURSTS = 2;
const END_TONE_GAIN = 0.08;

const LIVE_STATES = new Set(["dialing", "connected"]);
const TERMINAL_STATES = new Set([
  "completed",
  "failed",
  "no-answer",
  "voicemail",
]);

/**
 * Audible end-of-call feedback (#1363): when the call screen transitions from
 * a live state (dialing/connected) to a terminal one — either side hung up —
 * play two short busy-style bursts at the agent's chosen speaker. Fires only
 * on the transition, never for terminal states the screen merely renders
 * (e.g. revisiting a finished call's disposition).
 */
export function useCallEndTone({
  displayState,
  outputDeviceId,
}: {
  displayState: string;
  outputDeviceId: string | null;
}) {
  const previousStateRef = useRef(displayState);
  const outputDeviceIdRef = useRef(outputDeviceId);
  outputDeviceIdRef.current = outputDeviceId;

  /**
   * @effect Play a short end-of-call tone exactly when displayState crosses
   * from a live state (dialing/connected) into a terminal one, regardless of
   * which side hung up.
   * @effect-deps displayState (the call screen's single display source of
   * truth from useCampaignCallFlow; the previous value is tracked in a ref so
   * only genuine live→terminal transitions fire)
   * @effect-side-effects dom — creates a short-lived AudioContext + detached
   * <audio> element (via createTonePlayer) and burst timers; everything stops
   * and closes ~1s later or on cleanup
   * @effect-why-not-loader Purely client-side audio feedback tied to live
   * call-state transitions; no server data involved.
   */
  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = displayState;
    if (!LIVE_STATES.has(previous) || !TERMINAL_STATES.has(displayState)) {
      return;
    }

    const player = createTonePlayer({
      frequenciesHz: END_TONE_FREQUENCIES_HZ,
      gain: END_TONE_GAIN,
      outputDeviceId: outputDeviceIdRef.current,
    });
    if (!player) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < END_TONE_BURSTS; i += 1) {
      timers.push(
        setTimeout(
          () => player.burst(END_TONE_ON_MS),
          i * (END_TONE_ON_MS + END_TONE_GAP_MS),
        ),
      );
    }
    const stopTimer = setTimeout(
      () => player.stop(),
      END_TONE_BURSTS * (END_TONE_ON_MS + END_TONE_GAP_MS) + 200,
    );

    return () => {
      for (const timer of timers) clearTimeout(timer);
      clearTimeout(stopTimer);
      player.stop();
    };
  }, [displayState]);
}
