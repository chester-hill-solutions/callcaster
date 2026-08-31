import { logger } from "@/lib/logger.client";

export type TonePlayer = {
  /** Schedule one on-burst starting now (seconds from the context clock). */
  burst: (onMs: number) => void;
  /** Stop oscillators, close the context, detach the audio element. */
  stop: () => void;
};

/**
 * Shared Web Audio plumbing for call-feedback tones (#1341 ringback, #1363
 * hang-up tone): a set of sine oscillators through one gain node, routed via
 * MediaStreamAudioDestinationNode + a detached <audio> element so setSinkId
 * can steer the sound at the agent's chosen speaker (same technique as
 * useAudioDeviceTest). Returns null when Web Audio is unavailable.
 */
export function createTonePlayer({
  frequenciesHz,
  gain: gainValue,
  outputDeviceId,
}: {
  frequenciesHz: readonly number[];
  gain: number;
  outputDeviceId: string | null;
}): TonePlayer | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const dest = ctx.createMediaStreamDestination();
  gain.connect(dest);
  const oscillators = frequenciesHz.map((frequency) => {
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
  if (outputDeviceId && typeof audioElWithSink.setSinkId === "function") {
    audioElWithSink.setSinkId(outputDeviceId).catch((err) => {
      logger.warn("call-tone-player setSinkId failed", err);
    });
  }

  return {
    burst: (onMs: number) => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gainValue, now);
      gain.gain.setValueAtTime(0, now + onMs / 1000);
    },
    stop: () => {
      for (const oscillator of oscillators) {
        try {
          oscillator.stop();
        } catch {
          // already stopped
        }
      }
      audioEl.srcObject = null;
      ctx
        .close()
        .catch((err) => logger.debug("call-tone-player ctx close", err));
    },
  };
}
