import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Mic, Pause, Play, RotateCcw, Square, X } from "lucide-react";

import {
  getUsableAudioDevices,
  reconcileAudioDeviceId,
} from "@/hooks/call/audio-device-selection";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/typography";
import { toUserMessage } from "@/lib/user-message";
import { cn } from "@/lib/utils";

export type AudioRecorderProps = {
  /** Called once the user accepts a take. Blob is webm (Chrome/FF) or mp4 (Safari). */
  onComplete: (blob: Blob, mimeType: string, durationMs: number) => void;
  onCancel?: () => void;
  disabled?: boolean;
};

/** Phases of a take. `error` is not a phase — errors always return us to `idle`. */
type RecorderPhase = "idle" | "recording" | "paused" | "recorded";

/** Preference order; the first supported type wins. */
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

const METER_SEGMENT_COUNT = 24;

type WindowWithWebkitAudio = Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ??
    null
  );
}

function resolveAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext ?? null;
}

/** getUserMedia rejects with DOMException names we can turn into real guidance. */
function toMicErrorMessage(error: unknown): string {
  const fallback = "Could not start recording. Please try again.";
  if (error instanceof DOMException || error instanceof Error) {
    switch (error.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Microphone access was blocked. Allow microphone access in your browser settings, then try again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No microphone found. Connect a microphone and try again.";
      case "NotReadableError":
      case "TrackStartError":
        return "Your microphone is already in use by another app. Close it and try again.";
      default:
        break;
    }
  }
  return toUserMessage(error, fallback);
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function AudioRecorder({
  onComplete,
  onCancel,
  disabled = false,
}: AudioRecorderProps): React.JSX.Element {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Every releasable resource lives in a ref so cleanup never depends on render state.
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewUrlRef = useRef<string | null>(null);
  const takeRef = useRef<{ blob: Blob; mimeType: string; durationMs: number } | null>(
    null,
  );

  // Duration is measured here, not read off the preview element: HTMLAudioElement
  // .duration is frequently Infinity for MediaRecorder blobs in Chrome.
  const segmentStartedAtRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);

  /** Stop the rAF meter loop and tear down the Web Audio graph. */
  const releaseAudioGraph = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => {});
    }
    setLevel(0);
  }, []);

  /**
   * Stop every mic track. A live track keeps the browser's recording indicator
   * lit, so this must run on stop, on unmount, and on every error path.
   */
  const releaseStream = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        recorder.stop();
      } catch {
        // Already torn down by the UA; the track stop below is what matters.
      }
    }
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  /** Full teardown: mic, audio graph, rAF loop, object URL. */
  const releaseAll = useCallback(() => {
    releaseStream();
    releaseAudioGraph();
    revokePreview();
  }, [releaseAudioGraph, releaseStream, revokePreview]);

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextMicrophones = getUsableAudioDevices(devices, "audioinput");
      setMicrophones(nextMicrophones);
      setSelectedMicId((current) => reconcileAudioDeviceId(nextMicrophones, current));
    } catch {
      setMicrophones([]);
      setSelectedMicId(null);
    }
  }, []);

  /**
   * @effect On mount, enumerate the available microphones and subscribe to the
   * OS "devicechange" event so the picker stays fresh as mics are plugged in or
   * unplugged.
   * @effect-deps refreshDevices (stable callback; selection is reconciled with a
   * functional update so the listener always sees the current choice)
   * @effect-side-effects subscription (mediaDevices "devicechange" listener,
   * removed on unmount) + dom (enumerateDevices). No permission prompt is issued
   * here — labels fill in after the first successful recording.
   * @effect-why-not-loader Browser hardware enumeration is a client-only device
   * API, not app request/response data.
   */
  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () =>
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  /**
   * @effect Tick the visible elapsed timer roughly 4x/second while a take is
   * actively recording.
   * @effect-deps phase (starts the interval on 'recording'; any other phase
   * leaves the last committed elapsed value in place)
   * @effect-side-effects timer (setInterval), cleared on phase change/unmount
   * @effect-why-not-loader Wall-clock elapsed time is live client timer state,
   * not request/response data.
   */
  useEffect(() => {
    if (phase !== "recording") return;
    const interval = setInterval(() => {
      setElapsedMs(
        accumulatedMsRef.current + (performance.now() - segmentStartedAtRef.current),
      );
    }, 250);
    return () => clearInterval(interval);
  }, [phase]);

  /**
   * @effect Release the microphone, audio graph, rAF loop and object URL when the
   * component unmounts, so a discarded recorder never leaves the mic indicator on.
   * @effect-deps releaseAll (stable callback composed of stable callbacks; runs
   * cleanup only on unmount)
   * @effect-side-effects dom (MediaStreamTrack.stop, AudioContext.close,
   * cancelAnimationFrame, URL.revokeObjectURL)
   * @effect-why-not-loader Imperative teardown of browser media hardware handles;
   * there is no request/response data involved.
   */
  useEffect(() => releaseAll, [releaseAll]);

  /** Drive the input meter from the live stream. Must visibly react to input. */
  const startLevelMeter = useCallback(
    (stream: MediaStream) => {
      const AudioContextCtor = resolveAudioContextCtor();
      if (!AudioContextCtor) return;

      const context = new AudioContextCtor();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const samples = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (let i = 0; i < samples.length; i += 1) {
          // 128 is silence for time-domain data, so an absent sample reads as 0 deviation.
          const deviation = Math.abs((samples[i] ?? 128) - 128) / 128;
          if (deviation > peak) peak = deviation;
        }
        // Scale up: conversational speech peaks well below full scale.
        setLevel(Math.min(100, Math.round(peak * 160)));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  const handleStart = useCallback(async () => {
    setErrorMessage(null);
    revokePreview();
    takeRef.current = null;

    const mimeType = pickMimeType();
    if (!mimeType || typeof navigator?.mediaDevices?.getUserMedia !== "function") {
      setErrorMessage("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        const durationMs = Math.round(accumulatedMsRef.current);
        takeRef.current = { blob, mimeType, durationMs };
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setElapsedMs(durationMs);
        setPhase("recorded");
      };
      recorder.onerror = () => {
        releaseAll();
        setPhase("idle");
        setElapsedMs(0);
        setErrorMessage("Recording stopped unexpectedly. Please try again.");
      };

      accumulatedMsRef.current = 0;
      segmentStartedAtRef.current = performance.now();
      setElapsedMs(0);
      recorder.start();
      startLevelMeter(stream);
      setPhase("recording");
      // Labels are only exposed once permission is granted; refresh to fill them in.
      void refreshDevices();
    } catch (error) {
      // Never leave the UI in a recording state after a failed start.
      releaseAll();
      setPhase("idle");
      setElapsedMs(0);
      setErrorMessage(toMicErrorMessage(error));
    }
  }, [releaseAll, refreshDevices, revokePreview, selectedMicId, startLevelMeter]);

  const handlePause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    accumulatedMsRef.current += performance.now() - segmentStartedAtRef.current;
    setElapsedMs(accumulatedMsRef.current);
    setPhase("paused");
  }, []);

  const handleResume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    segmentStartedAtRef.current = performance.now();
    recorder.resume();
    setPhase("recording");
  }, []);

  const handleStop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (recorder.state === "recording") {
      accumulatedMsRef.current += performance.now() - segmentStartedAtRef.current;
    }
    // `onstop` builds the blob and moves us to `recorded`; the mic is released here.
    recorder.stop();
    recorderRef.current = null;
    releaseAudioGraph();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [releaseAudioGraph]);

  const handleRetake = useCallback(() => {
    releaseAll();
    takeRef.current = null;
    chunksRef.current = [];
    accumulatedMsRef.current = 0;
    setElapsedMs(0);
    setErrorMessage(null);
    setPhase("idle");
  }, [releaseAll]);

  const handleUseRecording = useCallback(() => {
    const take = takeRef.current;
    if (!take) return;
    onComplete(take.blob, take.mimeType, take.durationMs);
  }, [onComplete]);

  const handleCancel = useCallback(() => {
    releaseAll();
    takeRef.current = null;
    chunksRef.current = [];
    accumulatedMsRef.current = 0;
    setElapsedMs(0);
    setPhase("idle");
    onCancel?.();
  }, [onCancel, releaseAll]);

  const isActive = phase === "recording" || phase === "paused";
  const litSegments = Math.round((level / 100) * METER_SEGMENT_COUNT);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="flex flex-col gap-2">
        <Label htmlFor="audio-recorder-mic">Microphone</Label>
        <Select
          value={selectedMicId ?? undefined}
          onValueChange={setSelectedMicId}
          disabled={disabled || isActive || microphones.length === 0}
        >
          <SelectTrigger id="audio-recorder-mic">
            <SelectValue
              placeholder={
                microphones.length === 0 ? "No microphones found" : "Select a microphone"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {microphones.map((microphone, index) => (
              <SelectItem key={microphone.deviceId} value={microphone.deviceId}>
                {microphone.label || `Microphone ${index + 1}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-2.5 w-2.5 shrink-0 rounded-full",
            phase === "recording" && "animate-pulse bg-destructive",
            phase === "paused" && "bg-warning",
            !isActive && "bg-muted-foreground/40",
          )}
        />
        <span
          className="font-mono text-lg tabular-nums text-foreground"
          aria-live="off"
        >
          {formatElapsed(elapsedMs)}
        </span>
        <div
          className="flex h-4 flex-1 items-center gap-0.5"
          role="meter"
          aria-label="Microphone input level"
          aria-valuenow={isActive ? level : 0}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {Array.from({ length: METER_SEGMENT_COUNT }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-full flex-1 rounded-sm transition-colors",
                isActive && index < litSegments
                  ? index > METER_SEGMENT_COUNT - 4
                    ? "bg-destructive"
                    : "bg-primary"
                  : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>

      {phase === "recorded" && previewUrl ? (
        <div className="flex flex-col gap-1.5">
          <Text variant="caption">Preview</Text>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user-recorded audio has no caption track */}
          <audio className="w-full" controls src={previewUrl} />
        </div>
      ) : null}

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {phase === "idle" ? (
          <Button onClick={handleStart} disabled={disabled}>
            <Mic className="mr-2 h-4 w-4" aria-hidden="true" />
            Record
          </Button>
        ) : null}

        {phase === "recording" ? (
          <Button variant="secondary" onClick={handlePause} disabled={disabled}>
            <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
            Pause
          </Button>
        ) : null}

        {phase === "paused" ? (
          <Button variant="secondary" onClick={handleResume} disabled={disabled}>
            <Play className="mr-2 h-4 w-4" aria-hidden="true" />
            Resume
          </Button>
        ) : null}

        {isActive ? (
          <Button variant="outline" onClick={handleStop} disabled={disabled}>
            <Square className="mr-2 h-4 w-4" aria-hidden="true" />
            Stop
          </Button>
        ) : null}

        {phase === "recorded" ? (
          <>
            <Button onClick={handleUseRecording} disabled={disabled}>
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Use recording
            </Button>
            <Button variant="outline" onClick={handleRetake} disabled={disabled}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Re-take
            </Button>
          </>
        ) : null}

        {onCancel ? (
          <Button
            variant="ghost"
            onClick={handleCancel}
            disabled={disabled}
            className="ml-auto"
          >
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
