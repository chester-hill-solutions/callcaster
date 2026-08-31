import { useEffect, useRef } from "react";
import { logger } from "@/lib/logger.client";

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
   * @effect-side-effects dom — creates an AudioContext + detached <audio> element (for setSinkId speaker routing) and timers; all torn down on cleanup
   * @effect-why-not-loader Purely client-side audio feedback tied to live call state; no server data involved.
   */
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;
    const AudioCtx =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    let disposed = false;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    // Route through a MediaStreamAudioDestinationNode + <audio> so setSinkId
    // can steer the tone at the agent's chosen speaker (same technique as
    // useAudioDeviceTest's speaker test).
    const dest = ctx.createMediaStreamDestination();
    gain.connect(dest);
    const oscillators = RINGBACK_FREQUENCIES_HZ.map((frequency) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });

    const audioEl = document.createElement("audio");
    audioEl.srcObject = dest.stream;
    audioEl.autoplay = true;
    const audioElWithSink = audioEl as HTMLAudioElement & {
      setSinkId?: (deviceId: string) => Promise<void>;
    };
    const sinkId = outputDeviceIdRef.current;
    if (sinkId && typeof audioElWithSink.setSinkId === "function") {
      audioElWithSink.setSinkId(sinkId).catch((err) => {
        logger.warn("useDialRingback.setSinkId failed", err);
      });
    }

    const burst = () => {
      if (disposed) return;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(RINGBACK_GAIN, now);
      gain.gain.setValueAtTime(0, now + RINGBACK_ON_MS / 1000);
    };
    burst();
    const interval = setInterval(burst, RINGBACK_CADENCE_MS);

    return () => {
      disposed = true;
      clearInterval(interval);
      for (const oscillator of oscillators) {
        try {
          oscillator.stop();
        } catch {
          // already stopped
        }
      }
      audioEl.srcObject = null;
      ctx.close().catch((err) => logger.debug("useDialRingback ctx close", err));
    };
  }, [active]);
}
