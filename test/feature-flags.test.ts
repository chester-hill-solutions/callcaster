import { describe, expect, test } from "vitest";
import {
  CoachingConfig,
  WorkspaceFeatureFlags,
  TranscriptMetadata,
  CoachingEventPayload,
} from "@/lib/coaching-schemas";
import { hasFeatureFlag } from "@/lib/feature-flags";
import { liveMediaCapabilities } from "@/lib/live-media-capabilities";

describe("coaching-schemas", () => {
  test("WorkspaceFeatureFlags defaults", () => {
    const parsed = WorkspaceFeatureFlags.parse({});
    expect(parsed.liveTranscription).toBe(false);
    expect(parsed.liveCoaching).toBe(false);
  });

  test("CoachingConfig defaults", () => {
    const parsed = CoachingConfig.parse({});
    expect(parsed.wpmMin).toBe(120);
    expect(parsed.fillerWords).toContain("uh");
  });

  test("TranscriptMetadata and CoachingEventPayload passthrough", () => {
    expect(TranscriptMetadata.parse({ deepgramModel: "nova-3" }).deepgramModel).toBe(
      "nova-3",
    );
    expect(CoachingEventPayload.parse({ heading: "Slow down", suggestion: "…" }).heading).toBe(
      "Slow down",
    );
  });
});

describe("feature-flags", () => {
  test("hasFeatureFlag", () => {
    expect(hasFeatureFlag(null, "liveTranscription")).toBe(false);
    expect(hasFeatureFlag({ liveTranscription: true }, "liveTranscription")).toBe(true);
    expect(hasFeatureFlag({}, "liveCoaching")).toBe(false);
  });
});

describe("liveMediaCapabilities", () => {
  test("neither flag: nothing runs", () => {
    expect(liveMediaCapabilities({})).toEqual({
      attachStream: false,
      runCoaching: false,
      showTranscript: false,
      showCoaching: false,
    });
  });

  test("transcription only: stream + transcript UI, no coaching", () => {
    expect(liveMediaCapabilities({ liveTranscription: true })).toEqual({
      attachStream: true,
      runCoaching: false,
      showTranscript: true,
      showCoaching: false,
    });
  });

  test("coaching only: stream attaches (STT is coaching's input), transcript UI stays off", () => {
    expect(liveMediaCapabilities({ liveCoaching: true })).toEqual({
      attachStream: true,
      runCoaching: true,
      showTranscript: false,
      showCoaching: true,
    });
  });

  test("both flags: everything on", () => {
    expect(
      liveMediaCapabilities({ liveTranscription: true, liveCoaching: true }),
    ).toEqual({
      attachStream: true,
      runCoaching: true,
      showTranscript: true,
      showCoaching: true,
    });
  });

  test("null / undefined / garbage flags default to everything off", () => {
    const off = {
      attachStream: false,
      runCoaching: false,
      showTranscript: false,
      showCoaching: false,
    };
    expect(liveMediaCapabilities(null)).toEqual(off);
    expect(liveMediaCapabilities(undefined)).toEqual(off);
    expect(liveMediaCapabilities({ liveCoaching: "yes" })).toEqual(off);
  });
});
