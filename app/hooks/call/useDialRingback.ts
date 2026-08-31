import { useEffect, useRef } from "react";
import { createTonePlayer } from "@/lib/call-tone-player.client";

// North American ringback: 440 Hz + 480 Hz, 2 s on / 4 s off.
const RINGBACK_FREQUENCIES_HZ = [440, 480] as const;
const RINGBACK_ON_MS = 2000;
const RINGBACK_CADENCE_MS = 6000;
const RINGBACK_GAIN = 0.08;

/**
 * App-owned ringback for the campaign call screen (#1341).
 *
 * The Twilio SDK cannot sustain a dial tone here: the server dials the AGENT
 * leg, so the browser's looping `incoming` ringtone is killed the instant
 * auto-accept answers it, and the SDK's `outgoing` sound is hard-capped at
 * 3 s in SDK code. This plays a standard ringback for as long as the UI is in
 * the dialing state, routed at the agent's chosen speaker.
 */
export function useDialRingback({
  active,
  outputDeviceId,
}: {
  active: boolean;
  outputDeviceId: string | null;
}) {
  const outputDeviceIdRef = useRef(outputDeviceId);
  outputDeviceIdRef.current = outputDeviceId;

  /**
   * @effect Play a looping ringback tone while the call screen is dialing; stop it on connect or any terminal state.
   * @effect-deps active (displayState === "dialing" from useCampaignCallFlow — the single source of truth for the dialing window)
   * @effect-side-effects dom — creates an AudioContext + detached <audio> element (for setSinkId speaker routing, via createTonePlayer) and an interval timer; all torn down on cleanup
   * @effect-why-not-loader Purely client-side audio feedback tied to live call state; no server data involved.
   */
  useEffect(() => {
    if (!active) return;
    const player = createTonePlayer({
      frequenciesHz: RINGBACK_FREQUENCIES_HZ,
      gain: RINGBACK_GAIN,
      outputDeviceId: outputDeviceIdRef.current,
    });
    if (!player) return;

    player.burst(RINGBACK_ON_MS);
    const interval = setInterval(
      () => player.burst(RINGBACK_ON_MS),
      RINGBACK_CADENCE_MS,
    );

    return () => {
      clearInterval(interval);
      player.stop();
    };
  }, [active]);
}
