import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Pause, Play, Plus, Scissors, X } from "lucide-react";
import type WaveSurfer from "wavesurfer.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.esm.js";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Heading, Text } from "@/components/ui/typography";
import { MIN_CLIP_DURATION_MS } from "@/lib/audio-upload";
import { toUserMessage } from "@/lib/user-message";

export type ClipRange = { startMs: number; endMs: number };

export type AudioClipEditorProps = {
  src: string;
  fileName: string;
  initialDurationMs?: number;
  busy?: boolean;
  onSave: (range: ClipRange, mode: "new" | "overwrite") => void;
  onCancel?: () => void;
  /** Rendered inside the overwrite confirmation. Empty array = file is unused. */
  usage?: Array<{ label: string }>;
};

/** Waveform load lifecycle. Errors are terminal until the component remounts. */
type EditorStatus = "loading" | "ready" | "error";

const WAVEFORM_HEIGHT = 96;
const MIN_ZOOM_PX_PER_SEC = 10;
const MAX_ZOOM_PX_PER_SEC = 400;
const DEFAULT_ZOOM_PX_PER_SEC = 40;
const ZOOM_STEP_PX_PER_SEC = 20;

/** The one region we ever create; also how we find it again after a re-render. */
const CLIP_REGION_ID = "clip-window";

type WaveformColors = {
  waveColor: string;
  progressColor: string;
  cursorColor: string;
};

/**
 * Tailwind tokens are stored as bare HSL triplets (`240 10% 3.9%`), so they must
 * be wrapped before a canvas can use them. `getComputedStyle` resolves the
 * `var()` chains (`--primary: var(--brand-primary)`) down to a literal triplet.
 */
function readToken(element: HTMLElement, token: string, fallback: string): string {
  const raw = getComputedStyle(element).getPropertyValue(token).trim();
  return raw.length > 0 ? `hsl(${raw})` : fallback;
}

/**
 * Canvas pixels cannot reference CSS variables, so the wave colors are resolved
 * eagerly here and re-applied whenever the theme class flips. (The region
 * overlay is a real DOM element, so it keeps a live `var()` color instead.)
 */
function readWaveformColors(element: HTMLElement): WaveformColors {
  return {
    waveColor: readToken(element, "--muted-foreground", "hsl(240 3.8% 46.1%)"),
    progressColor: readToken(element, "--primary", "hsl(357 75% 45%)"),
    cursorColor: readToken(element, "--foreground", "hsl(240 10% 3.9%)"),
  };
}

/** mm:ss.mmm — the format the numeric inputs both render and accept. */
function formatMs(totalMs: number): string {
  const clamped = Math.max(0, Math.round(totalMs));
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    millis,
  ).padStart(3, "0")}`;
}

/** Accepts `mm:ss.mmm`, `m:ss`, or a plain millisecond count. Null = unparseable. */
function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const match = trimmed.match(/^(\d+):([0-5]?\d)(?:\.(\d{1,3}))?$/);
  if (!match) return null;

  const [, minutes = "0", seconds = "0", fraction = ""] = match;
  const millis = Number(fraction.padEnd(3, "0") || "0");
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + millis;
}

export function AudioClipEditor({
  src,
  fileName,
  initialDurationMs,
  busy = false,
  onSave,
  onCancel,
  usage,
}: AudioClipEditorProps): React.JSX.Element {
  const [status, setStatus] = useState<EditorStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number>(initialDurationMs ?? 0);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState<number>(initialDurationMs ?? 0);
  // Held separately from the numbers so a half-typed value isn't clobbered.
  const [startText, setStartText] = useState(formatMs(0));
  const [endText, setEndText] = useState(formatMs(initialDurationMs ?? 0));
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM_PX_PER_SEC);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const regionRef = useRef<Region | null>(null);

  /** Push a range to both the inputs and the region, keeping the two in step. */
  const syncRangeFromRegion = useCallback((nextStartMs: number, nextEndMs: number) => {
    setStartMs(nextStartMs);
    setEndMs(nextEndMs);
    setStartText(formatMs(nextStartMs));
    setEndText(formatMs(nextEndMs));
  }, []);

  /**
   * @effect Load the waveform for `src` and create the single clip region that
   * defines the cut, keeping React state in step as the user drags or resizes it.
   * @effect-deps src (a new signed URL means a new file: the old instance is
   * destroyed and a fresh one is built) + syncRangeFromRegion (stable callback)
   * @effect-side-effects dom (dynamic import of wavesurfer, canvas render into
   * the container, WebAudio graph) + fetch (wavesurfer downloads the signed URL,
   * aborted via AbortController on cleanup) + subscription (wavesurfer ready /
   * error / play / pause and region update listeners). All released on unmount by
   * `WaveSurfer.destroy()`.
   * @effect-why-not-loader wavesurfer touches `window` at import time and renders
   * to a live canvas, so it cannot run during SSR or in a loader; the import is
   * deliberately dynamic to keep it out of the server graph. The loader supplies
   * the signed URL — decoding the audio is imperative browser work.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const abortController = new AbortController();
    setStatus("loading");
    setErrorMessage(null);

    const bootstrap = async () => {
      // Dynamic so wavesurfer never enters the server bundle: it reads `window`
      // at module scope and would crash SSR / trip check:route-server-leaks.
      const [{ default: WaveSurferCtor }, { default: RegionsPlugin }] =
        await Promise.all([
          import("wavesurfer.js"),
          import("wavesurfer.js/dist/plugins/regions.esm.js"),
        ]);
      if (disposed) return;

      const colors = readWaveformColors(container);
      const regions = RegionsPlugin.create();
      const waveSurfer = WaveSurferCtor.create({
        container,
        height: WAVEFORM_HEIGHT,
        minPxPerSec: DEFAULT_ZOOM_PX_PER_SEC,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        cursorWidth: 2,
        autoScroll: true,
        plugins: [regions],
        fetchParams: { signal: abortController.signal },
        ...colors,
      });
      waveSurferRef.current = waveSurfer;

      waveSurfer.on("ready", () => {
        const duration = waveSurfer.getDuration();
        regions.clearRegions();
        // The region is seeded to the whole file: the default cut is "no cut".
        regionRef.current = regions.addRegion({
          id: CLIP_REGION_ID,
          start: 0,
          end: duration,
          drag: true,
          resize: true,
          // A DOM element can hold a live `var()`, so this tracks the theme itself.
          color: "color-mix(in srgb, var(--primary) 18%, transparent)",
          minLength: MIN_CLIP_DURATION_MS / 1000,
        });
        setDurationMs(Math.round(duration * 1000));
        syncRangeFromRegion(0, Math.round(duration * 1000));
        setStatus("ready");
      });

      waveSurfer.on("error", (error: Error) => {
        if (disposed || abortController.signal.aborted) return;
        setStatus("error");
        setErrorMessage(
          toUserMessage(error, "Could not load this audio file. The link may have expired."),
        );
      });

      waveSurfer.on("play", () => setIsPlaying(true));
      waveSurfer.on("pause", () => setIsPlaying(false));
      waveSurfer.on("finish", () => setIsPlaying(false));

      const handleRegionChange = (region: Region) => {
        if (region.id !== CLIP_REGION_ID) return;
        syncRangeFromRegion(
          Math.round(region.start * 1000),
          Math.round(region.end * 1000),
        );
      };
      regions.on("region-update", handleRegionChange);
      regions.on("region-updated", handleRegionChange);

      try {
        await waveSurfer.load(src);
      } catch (error) {
        // Destroying mid-load rejects with an AbortError; that is us, not a fault.
        if (disposed || abortController.signal.aborted) return;
        setStatus("error");
        setErrorMessage(
          toUserMessage(error, "Could not load this audio file. The link may have expired."),
        );
      }
    };

    void bootstrap().catch((error: unknown) => {
      if (disposed) return;
      setStatus("error");
      setErrorMessage(
        toUserMessage(error, "Could not load the audio editor. Please reload the page."),
      );
    });

    return () => {
      disposed = true;
      abortController.abort();
      regionRef.current = null;
      const instance = waveSurferRef.current;
      waveSurferRef.current = null;
      // Releases the WebAudio graph and the media element; skipping this leaks
      // one audio context per mount.
      instance?.destroy();
    };
  }, [src, syncRangeFromRegion]);

  /**
   * @effect Re-resolve the waveform colors when the theme class flips, since the
   * canvas holds resolved colors rather than live CSS variables.
   * @effect-deps none (the observer reads the tokens fresh on every mutation, so
   * it never closes over a stale color)
   * @effect-side-effects subscription (MutationObserver on the documentElement
   * `class` attribute, disconnected on unmount) + dom (re-reads computed styles
   * and repaints the waveform)
   * @effect-why-not-loader Dark mode is a class on `<html>`; the resolved token
   * values are computed style, not request/response data.
   */
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const container = containerRef.current;
      const waveSurfer = waveSurferRef.current;
      if (!container || !waveSurfer) return;
      waveSurfer.setOptions(readWaveformColors(container));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  /** Commit a typed value: clamp it, move the region, and mirror it back. */
  const applyRange = useCallback(
    (nextStartMs: number, nextEndMs: number) => {
      const upperBound = durationMs > 0 ? durationMs : Math.max(nextEndMs, nextStartMs);
      const safeStart = Math.min(Math.max(0, nextStartMs), upperBound);
      const safeEnd = Math.min(Math.max(safeStart, nextEndMs), upperBound);
      setStartMs(safeStart);
      setEndMs(safeEnd);
      regionRef.current?.setOptions({
        start: safeStart / 1000,
        end: safeEnd / 1000,
      });
    },
    [durationMs],
  );

  const handleStartInput = useCallback(
    (value: string) => {
      setStartText(value);
      const parsed = parseTimeInput(value);
      if (parsed !== null) applyRange(parsed, endMs);
    },
    [applyRange, endMs],
  );

  const handleEndInput = useCallback(
    (value: string) => {
      setEndText(value);
      const parsed = parseTimeInput(value);
      if (parsed !== null) applyRange(startMs, parsed);
    },
    [applyRange, startMs],
  );

  /** Snap the text back to the canonical format once the user leaves the field. */
  const handleStartBlur = useCallback(() => setStartText(formatMs(startMs)), [startMs]);
  const handleEndBlur = useCallback(() => setEndText(formatMs(endMs)), [endMs]);

  const handlePlayPause = useCallback(() => {
    void waveSurferRef.current?.playPause();
  }, []);

  const handlePlayRegion = useCallback(() => {
    // `true` stops at the region end, so this previews exactly what gets saved.
    regionRef.current?.play(true);
  }, []);

  const handleZoom = useCallback((next: number) => {
    const clamped = Math.min(MAX_ZOOM_PX_PER_SEC, Math.max(MIN_ZOOM_PX_PER_SEC, next));
    setZoom(clamped);
    waveSurferRef.current?.zoom(clamped);
  }, []);

  const clipDurationMs = Math.max(0, endMs - startMs);
  const isTooShort = clipDurationMs < MIN_CLIP_DURATION_MS;
  const canSave = status === "ready" && !busy && !isTooShort;
  const usageLabels = usage ?? [];

  const handleSaveNew = useCallback(() => {
    onSave({ startMs, endMs }, "new");
  }, [endMs, onSave, startMs]);

  const handleConfirmOverwrite = useCallback(() => {
    setConfirmOpen(false);
    onSave({ startMs, endMs }, "overwrite");
  }, [endMs, onSave, startMs]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading level={3} as="h2">
          Trim audio
        </Heading>
        <Text variant="muted">{fileName}</Text>
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          className="w-full rounded-md bg-muted/40"
          style={{ minHeight: WAVEFORM_HEIGHT }}
          aria-hidden="true"
        />
        {status === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <Spinner />
            <Text variant="muted">Loading waveform…</Text>
          </div>
        ) : null}
      </div>

      {status === "error" && errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={handlePlayPause}
          disabled={status !== "ready" || busy}
        >
          {isPlaying ? (
            <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button
          variant="outline"
          onClick={handlePlayRegion}
          disabled={status !== "ready" || busy}
        >
          <Scissors className="mr-2 h-4 w-4" aria-hidden="true" />
          Play selection
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            onClick={() => handleZoom(zoom - ZOOM_STEP_PX_PER_SEC)}
            disabled={status !== "ready" || busy || zoom <= MIN_ZOOM_PX_PER_SEC}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </Button>
          <input
            type="range"
            aria-label="Zoom level"
            className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            min={MIN_ZOOM_PX_PER_SEC}
            max={MAX_ZOOM_PX_PER_SEC}
            step={5}
            value={zoom}
            disabled={status !== "ready" || busy}
            onChange={(event) => handleZoom(Number(event.target.value))}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            onClick={() => handleZoom(zoom + ZOOM_STEP_PX_PER_SEC)}
            disabled={status !== "ready" || busy || zoom >= MAX_ZOOM_PX_PER_SEC}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audio-clip-start">Start</Label>
          <Input
            id="audio-clip-start"
            inputMode="numeric"
            className="font-mono tabular-nums"
            value={startText}
            disabled={status !== "ready" || busy}
            onChange={(event) => handleStartInput(event.target.value)}
            onBlur={handleStartBlur}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audio-clip-end">End</Label>
          <Input
            id="audio-clip-end"
            inputMode="numeric"
            className="font-mono tabular-nums"
            value={endText}
            disabled={status !== "ready" || busy}
            onChange={(event) => handleEndInput(event.target.value)}
            onBlur={handleEndBlur}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Text variant="caption">Selected</Text>
          <span className="font-mono text-lg tabular-nums text-foreground">
            {formatMs(clipDurationMs)}
          </span>
        </div>
      </div>

      <Text variant="caption">
        Enter a time as mm:ss.mmm or as a plain number of milliseconds. Full file:{" "}
        {formatMs(durationMs)}.
      </Text>

      {status === "ready" && isTooShort ? (
        <Alert variant="destructive">
          <AlertDescription>
            The selection is too short. Clips must be at least {MIN_CLIP_DURATION_MS}ms
            long.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSaveNew} disabled={!canSave}>
          {busy ? <Spinner className="mr-2 h-4 w-4" /> : null}
          {busy ? "Saving…" : "Save as new clip"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          disabled={!canSave}
        >
          Overwrite original
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={busy} className="ml-auto">
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Cancel
          </Button>
        ) : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite {fileName}?</DialogTitle>
            <DialogDescription>
              This replaces the original file. Anything already pointing at this
              filename will play the trimmed version instead — including live
              campaigns.
            </DialogDescription>
          </DialogHeader>

          {usageLabels.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Text variant="small">This file is used by:</Text>
              <ul className="list-disc pl-5">
                {usageLabels.map((entry) => (
                  <li key={entry.label}>
                    <Text variant="small">{entry.label}</Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Text variant="muted">
              Nothing currently references this file, so no campaign will change.
            </Text>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmOverwrite}
              disabled={busy}
            >
              Overwrite original
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
