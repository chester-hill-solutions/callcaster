import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger.client";

/**
 * Audio device test controls for the Call Settings sheet (#1339).
 *
 * - `playSpeakerTone` synthesizes a short 440Hz tone through the selected
 *   output device so the operator can confirm they can hear their picked
 *   speaker before joining a call. Uses `AudioContext` + `setSinkId` on the
 *   downstream `<audio>` element; falls back to the default output when the
 *   browser doesn't support `setSinkId` (Safari today).
 * - `startMicMonitor` / `stopMicMonitor` drive `micLevel` (a smoothed 0–1
 *   value) from an `AnalyserNode` over the passed MediaStream so the sheet
 *   can render a live level meter. Auto-stops after
 *   {@link MIC_MONITOR_MAX_MS} in case the caller forgets — the whole
 *   feature is a "look, it's working" affordance, not an always-on meter.
 *
 * All resources (AudioContext, MediaStreamAudioSourceNode, requestAnimationFrame,
 * timeout, `<audio>` element) are torn down on stop and on unmount so the
 * hook never leaks the mic input past its opt-in test window.
 */

export const MIC_MONITOR_MAX_MS = 8000;
export const SPEAKER_TEST_TONE_MS = 450;
export const SPEAKER_TEST_TONE_HZ = 440;

type UseAudioDeviceTestOptions = {
  /** The live MediaStream from `getUserMedia`; only used for mic monitoring. */
  stream: MediaStream | null;
};

export function useAudioDeviceTest({ stream }: UseAudioDeviceTestOptions) {
  const [micLevel, setMicLevel] = useState(0);
  const [isMicMonitoring, setIsMicMonitoring] = useState(false);
  const [isSpeakerPlaying, setIsSpeakerPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const monitorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speakerAudioElRef = useRef<HTMLAudioElement | null>(null);
  const speakerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopMicMonitor = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (monitorTimeoutRef.current) {
      clearTimeout(monitorTimeoutRef.current);
      monitorTimeoutRef.current = null;
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      // MediaStreamAudioSourceNode.disconnect throws if already disconnected.
    }
    sourceRef.current = null;
    analyserRef.current = null;
    setMicLevel(0);
    setIsMicMonitoring(false);
  }, []);

  const startMicMonitor = useCallback(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setError("No microphone stream available. Grant mic access first.");
      return;
    }
    // If already monitoring, this is a no-op — the "click again to stop"
    // path in the UI calls stopMicMonitor directly.
    if (analyserRef.current) return;
    setError(null);
    try {
      const AudioCtx =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) {
        setError("Web Audio API is unavailable in this browser.");
        return;
      }
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
      setIsMicMonitoring(true);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buffer);
        // Peak-normalized RMS: values arrive centered on 128 (silence).
        let sumSq = 0;
        for (let i = 0; i < buffer.length; i++) {
          // noUncheckedIndexedAccess types buffer[i] as `number | undefined`
          // even though Uint8Array can't hold a hole; local narrowing keeps
          // the loop tight without a cast.
          const sample = buffer[i] ?? 128;
          const v = (sample - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / buffer.length);
        setMicLevel(Math.min(1, rms * 2));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      monitorTimeoutRef.current = setTimeout(() => {
        stopMicMonitor();
      }, MIC_MONITOR_MAX_MS);
    } catch (err) {
      logger.error("useAudioDeviceTest.startMicMonitor failed", err);
      setError("Could not start the microphone meter.");
      stopMicMonitor();
    }
  }, [stream, stopMicMonitor]);

  const stopSpeakerTest = useCallback(() => {
    if (speakerTimeoutRef.current) {
      clearTimeout(speakerTimeoutRef.current);
      speakerTimeoutRef.current = null;
    }
    const el = speakerAudioElRef.current;
    if (el) {
      try {
        el.pause();
        el.src = "";
      } catch {
        // best effort — element may already be detached
      }
      speakerAudioElRef.current = null;
    }
    setIsSpeakerPlaying(false);
  }, []);

  const playSpeakerTone = useCallback(
    async (outputDeviceId?: string | null) => {
      setError(null);
      // Cancel any in-flight test first — a double-click should never
      // stack two concurrent tones.
      stopSpeakerTest();
      try {
        const AudioCtx =
          window.AudioContext ??
          (window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }).webkitAudioContext;
        if (!AudioCtx) {
          setError("Web Audio API is unavailable in this browser.");
          return;
        }
        const ctx = new AudioCtx();
        const oscillator = ctx.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = SPEAKER_TEST_TONE_HZ;
        const gain = ctx.createGain();
        gain.gain.value = 0.15;
        // Route the oscillator through a MediaStreamAudioDestinationNode so we
        // can point an <audio> element at it and call setSinkId — the only
        // way to steer Web Audio output at a specific speaker in Chromium.
        const dest = ctx.createMediaStreamDestination();
        oscillator.connect(gain).connect(dest);

        const audioEl = document.createElement("audio");
        audioEl.srcObject = dest.stream;
        audioEl.autoplay = true;
        speakerAudioElRef.current = audioEl;

        const audioElWithSink = audioEl as HTMLAudioElement & {
          setSinkId?: (deviceId: string) => Promise<void>;
        };
        if (outputDeviceId && typeof audioElWithSink.setSinkId === "function") {
          try {
            await audioElWithSink.setSinkId(outputDeviceId);
          } catch (sinkErr) {
            logger.warn("useAudioDeviceTest.setSinkId failed", sinkErr);
          }
        }

        oscillator.start();
        setIsSpeakerPlaying(true);
        speakerTimeoutRef.current = setTimeout(() => {
          try {
            oscillator.stop();
          } catch {
            // already stopped
          }
          ctx
            .close()
            .catch((closeErr) =>
              logger.debug("useAudioDeviceTest ctx close", closeErr),
            );
          stopSpeakerTest();
        }, SPEAKER_TEST_TONE_MS);
      } catch (err) {
        logger.error("useAudioDeviceTest.playSpeakerTone failed", err);
        setError("Could not play the test tone.");
        stopSpeakerTest();
      }
    },
    [stopSpeakerTest],
  );

  /**
   * @effect Tear down both timers, the raf loop, the AudioContext, the
   * analyser graph, and any lingering `<audio>` element on unmount so the
   * hook never holds an open mic stream or a scheduled tone past the
   * component that opened them.
   * @effect-deps [] — mount-once cleanup, no external state.
   * @effect-side-effects timer (clearTimeout ×2), subscription (cancelAnimationFrame),
   * dom (AudioContext close + audio element cleanup)
   * @effect-why-not-loader Pure resource release, not data fetching.
   */
  useEffect(
    () => () => {
      stopMicMonitor();
      stopSpeakerTest();
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        ctx
          .close()
          .catch((closeErr) =>
            logger.debug("useAudioDeviceTest unmount ctx close", closeErr),
          );
      }
    },
    [stopMicMonitor, stopSpeakerTest],
  );

  return {
    micLevel,
    isMicMonitoring,
    isSpeakerPlaying,
    error,
    startMicMonitor,
    stopMicMonitor,
    playSpeakerTone,
    stopSpeakerTest,
  };
}
