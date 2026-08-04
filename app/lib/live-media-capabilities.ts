import type { WorkspaceFeatureFlags } from "@/lib/coaching-schemas";
import { hasFeatureFlag } from "@/lib/feature-flags";

/**
 * Derives what a workspace's live-media pipeline should actually do from its
 * persisted feature flags.
 *
 * The persisted flags (`liveTranscription`, `liveCoaching`) stay independent —
 * enabling coaching does NOT write `liveTranscription: true`. All implication
 * is derived here, at runtime:
 *
 * - Coaching consumes realtime transcription as its input, so enabling coaching
 *   alone must still attach the Twilio Media Stream (`attachStream`). Gating the
 *   stream on `liveTranscription` alone leaves coaching-only workspaces with no
 *   audio and no cues.
 * - The transcript UI is the transcription product, so `showTranscript` stays
 *   gated on `liveTranscription` only. A coaching-only workspace runs STT
 *   internally but never shows the raw transcript.
 */
export type LiveMediaCapabilities = {
  /** Attach `<Start><Stream>` — coaching cannot work without STT input. */
  attachStream: boolean;
  /** Run the coaching engine over committed transcripts. */
  runCoaching: boolean;
  /** Render the live transcript UI. */
  showTranscript: boolean;
  /** Render the live coaching UI. */
  showCoaching: boolean;
};

export function liveMediaCapabilities(
  flags: WorkspaceFeatureFlags | Record<string, unknown> | null | undefined,
): LiveMediaCapabilities {
  const liveTranscription = hasFeatureFlag(flags, "liveTranscription");
  const liveCoaching = hasFeatureFlag(flags, "liveCoaching");

  return {
    attachStream: liveTranscription || liveCoaching,
    runCoaching: liveCoaching,
    showTranscript: liveTranscription,
    showCoaching: liveCoaching,
  };
}
