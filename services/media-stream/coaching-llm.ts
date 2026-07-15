/**
 * Cohere calls for the coaching engine: generate, parse, and VALIDATE.
 *
 * Every failure mode here is non-fatal by contract — no API key, HTTP error,
 * malformed JSON, or a well-formed response that is not a cue all resolve to
 * `null`/`""`. An LLM is a best-effort embellishment on the rule-based cues; it
 * must never be able to take down a live call's coaching session.
 */
import { z } from "zod";
import type { CoachingState } from "./coaching-state";
import type { CueIntent } from "./coaching-rules";

const COHERE_GENERATE_URL = "https://api.cohere.com/v1/generate";
const COHERE_MODEL = "command-a-03-2025";
const CUE_CONTEXT_SEGMENTS = 10;

/** Shape Cohere is asked to emit. Anything else is discarded, not thrown on. */
const LlmCue = z.object({
  heading: z.string().trim().min(1),
  suggestion: z.string().trim().min(1),
});

const CohereGenerateResponse = z.object({
  generations: z
    .array(z.object({ text: z.string().optional() }).passthrough())
    .optional(),
});

function transcriptOf(state: CoachingState, limit?: number): string {
  const segments = limit ? state.segments.slice(-limit) : state.segments;
  return segments
    .map((segment) => `${segment.speaker_label ?? "speaker"}: ${segment.text}`)
    .join("\n");
}

async function cohereGenerate(
  apiKey: string,
  prompt: string,
  options: { maxTokens: number; temperature: number },
): Promise<string | null> {
  const response = await fetch(COHERE_GENERATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      prompt,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    }),
  });

  if (!response.ok) return null;

  const parsed = CohereGenerateResponse.safeParse(await response.json());
  if (!parsed.success) return null;

  return parsed.data.generations?.[0]?.text?.trim() ?? null;
}

/** Parse + validate a raw LLM completion into a cue. Never throws. */
export function parseLlmCue(raw: string | null | undefined): CueIntent | null {
  if (!raw?.trim()) return null;

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }

  const cue = LlmCue.safeParse(candidate);
  if (!cue.success) return null;

  return {
    type: "suggestion",
    severity: "info",
    payload: { heading: cue.data.heading, suggestion: cue.data.suggestion },
    heading: cue.data.heading,
    suggestion: cue.data.suggestion,
  };
}

/** Ask Cohere for one coaching cue. Returns null on any failure. */
export async function generateLlmCue(
  state: CoachingState,
): Promise<CueIntent | null> {
  const apiKey = process.env.COHERE_API_KEY?.trim();
  if (!apiKey) return null;
  if (state.segments.length === 0) return null;

  const prompt = `You are an ${state.config.llmPersona}. Based on the last utterances of a live phone call, give ONE concise coaching cue for the agent. Respond as JSON only: {"heading":"two words","suggestion":"one sentence"}.

Transcript:
${transcriptOf(state, CUE_CONTEXT_SEGMENTS)}`;

  try {
    const raw = await cohereGenerate(apiKey, prompt, {
      maxTokens: 100,
      temperature: 0.7,
    });
    return parseLlmCue(raw);
  } catch {
    // Non-fatal — rule-based cues still work without the LLM.
    return null;
  }
}

/** Ask Cohere for a call summary. Returns "" on any failure. */
export async function generateCallSummary(state: CoachingState): Promise<string> {
  const apiKey = process.env.COHERE_API_KEY?.trim();
  if (!apiKey) return "";
  if (state.segments.length === 0) return "";

  const prompt = `Summarize this call in 2-3 sentences for the agent, noting one strength and one improvement:\n\n${transcriptOf(state)}`;

  try {
    const raw = await cohereGenerate(apiKey, prompt, {
      maxTokens: 150,
      temperature: 0.5,
    });
    return raw ?? "";
  } catch {
    // Non-fatal — the session still finalizes without a summary.
    return "";
  }
}
