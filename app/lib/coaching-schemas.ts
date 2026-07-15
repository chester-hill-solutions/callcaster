import { z } from "zod";

/** Workspace feature flags used by live transcription / coaching (ADR-0027/0028). */
export const WorkspaceFeatureFlags = z
  .object({
    liveTranscription: z.boolean().default(false),
    liveCoaching: z.boolean().default(false),
  })
  .passthrough();

export type WorkspaceFeatureFlags = z.infer<typeof WorkspaceFeatureFlags>;

export const CoachingConfig = z.object({
  fillerWords: z
    .array(z.string())
    .default(["uh", "um", "like", "you know", "basically", "actually"]),
  wpmMin: z.number().default(120),
  wpmMax: z.number().default(160),
  pauseThresholdMs: z.number().default(1500),
  llmCadenceMs: z.number().default(30_000),
  llmPersona: z.string().default("encouraging sales coach"),
  disclosureEnabled: z.boolean().default(false),
});

export type CoachingConfig = z.infer<typeof CoachingConfig>;

export const CoachingEventPayload = z
  .object({
    count: z.number().optional(),
    words: z.array(z.string()).optional(),
    wpm: z.number().optional(),
    range: z.enum(["fast", "slow"]).optional(),
    durationMs: z.number().optional(),
    position: z.enum(["mid_sentence", "end_sentence"]).optional(),
    heading: z.string().optional(),
    suggestion: z.string().optional(),
    signal: z.string().optional(),
    snippet: z.string().optional(),
  })
  .passthrough();

export type CoachingEventPayload = z.infer<typeof CoachingEventPayload>;

export const TranscriptMetadata = z
  .object({
    deepgramModel: z.string().optional(),
    cohereModel: z.string().optional(),
    utteranceCount: z.number().optional(),
    detectedLanguage: z.string().optional(),
  })
  .passthrough();

export type TranscriptMetadata = z.infer<typeof TranscriptMetadata>;

export const DEFAULT_COACHING_CONFIG: CoachingConfig = CoachingConfig.parse({});
