import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CoachingConfig } from "../app/lib/coaching-schemas";
import { createCoachingState, type CoachingState } from "../services/media-stream/coaching-state";
import {
  generateCallSummary,
  generateLlmCue,
  parseLlmCue,
} from "../services/media-stream/coaching-llm";
import type { TranscriptSegmentRow } from "../services/media-stream/db-writer";

const config: CoachingConfig = {
  fillerWords: ["uh"],
  wpmMin: 120,
  wpmMax: 160,
  pauseThresholdMs: 1500,
  llmCadenceMs: 30_000,
  llmPersona: "coach",
  disclosureEnabled: false,
};

function stateWithSegments(): CoachingState {
  const state = createCoachingState({
    callSid: "CA123",
    workspaceId: "ws-1",
    direction: "outbound",
    config,
  });
  state.segments.push({
    id: "seg-1",
    call_sid: "CA123",
    speaker: 0,
    speaker_label: "agent",
    text: "hello there",
    start_ms: 0,
    end_ms: 1_000,
    confidence: 0.9,
    filler_count: 0,
    is_final: true,
    created_at: new Date().toISOString(),
  } as TranscriptSegmentRow);
  return state;
}

function cohereReplying(text: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ generations: [{ text }] }),
  });
}

describe("parseLlmCue", () => {
  test("accepts a well-formed cue", () => {
    expect(parseLlmCue('{"heading":"Slow down","suggestion":"Take a breath."}')).toEqual({
      type: "suggestion",
      severity: "info",
      payload: { heading: "Slow down", suggestion: "Take a breath." },
      heading: "Slow down",
      suggestion: "Take a breath.",
    });
  });

  test.each([
    ["malformed json", "not json at all"],
    ["truncated json", '{"heading":"Slow down","sugg'],
    ["missing suggestion", '{"heading":"Slow down"}'],
    ["empty heading", '{"heading":"","suggestion":"Take a breath."}'],
    ["wrong types", '{"heading":42,"suggestion":["a"]}'],
    ["json but not an object", '"just a string"'],
    ["empty string", ""],
  ])("returns null and does not throw on %s", (_label, raw) => {
    expect(() => parseLlmCue(raw)).not.toThrow();
    expect(parseLlmCue(raw)).toBeNull();
  });
});

describe("generateLlmCue", () => {
  beforeEach(() => {
    process.env.COHERE_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.COHERE_API_KEY;
    vi.unstubAllGlobals();
  });

  test("returns a validated cue on a good response", async () => {
    vi.stubGlobal("fetch", cohereReplying('{"heading":"Ask more","suggestion":"Try an open question."}'));
    await expect(generateLlmCue(stateWithSegments())).resolves.toMatchObject({
      type: "suggestion",
      heading: "Ask more",
    });
  });

  test("malformed LLM output is non-fatal", async () => {
    vi.stubGlobal("fetch", cohereReplying("Sure! Here's a cue: be nicer."));
    await expect(generateLlmCue(stateWithSegments())).resolves.toBeNull();
  });

  test("a thrown fetch is non-fatal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(generateLlmCue(stateWithSegments())).resolves.toBeNull();
  });

  test("a non-ok response is non-fatal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(generateLlmCue(stateWithSegments())).resolves.toBeNull();
  });

  test("an unexpected response envelope is non-fatal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ generations: "nope" }) }),
    );
    await expect(generateLlmCue(stateWithSegments())).resolves.toBeNull();
  });

  test("skips the call entirely without an API key", async () => {
    delete process.env.COHERE_API_KEY;
    const fetchMock = cohereReplying("{}");
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateLlmCue(stateWithSegments())).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("generateCallSummary", () => {
  beforeEach(() => {
    process.env.COHERE_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.COHERE_API_KEY;
    vi.unstubAllGlobals();
  });

  test("returns the summary text", async () => {
    vi.stubGlobal("fetch", cohereReplying("  Good call.  "));
    await expect(generateCallSummary(stateWithSegments())).resolves.toBe("Good call.");
  });

  test("a thrown fetch is non-fatal and yields an empty summary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(generateCallSummary(stateWithSegments())).resolves.toBe("");
  });
});
