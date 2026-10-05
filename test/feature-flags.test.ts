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

  test.each([
    { flag: "liveTranscription", flags: { liveTranscription: true, liveCoaching: "yes" } },
    { flag: "liveTranscription", flags: { liveTranscription: true, batchTranscription: null } },
    { flag: "liveCoaching", flags: { liveCoaching: true, liveTranscription: 1 } },
    { flag: "liveCoaching", flags: { liveCoaching: true, batchTranscription: "true" } },
    { flag: "batchTranscription", flags: { batchTranscription: true, liveTranscription: [] } },
    { flag: "batchTranscription", flags: { batchTranscription: true, liveCoaching: {} } },
  ])("a true $flag survives a malformed known sibling", ({ flag, flags }) => {
    expect(hasFeatureFlag(flags, flag)).toBe(true);
  });

  test.each([
    { value: false },
    { value: "true" },
    { value: "false" },
    { value: 1 },
    { value: 0 },
    { value: null },
    { value: undefined },
    { value: [] },
    { value: {} },
  ])("a requested flag with value $value stays off", ({ value }) => {
    expect(hasFeatureFlag({ liveTranscription: value, liveCoaching: true }, "liveTranscription")).toBe(false);
  });

  test("a missing requested flag stays off beside another true flag", () => {
    expect(hasFeatureFlag({ liveCoaching: true }, "liveTranscription")).toBe(false);
  });

  test("an unknown key does not disable a true known flag", () => {
    expect(hasFeatureFlag({ liveTranscription: true, operatorNote: "private" }, "liveTranscription")).toBe(true);
  });
});

describe("liveMediaCapabilities", () => {
  test("transcription survives invalid coaching without enabling coaching", () => {
    expect(liveMediaCapabilities({ liveTranscription: true, liveCoaching: "yes" })).toEqual({
      attachStream: true,
      runCoaching: false,
      showTranscript: true,
      showCoaching: false,
    });
  });

  test("coaching survives invalid transcription without showing the transcript", () => {
    expect(liveMediaCapabilities({ liveCoaching: true, liveTranscription: "yes" })).toEqual({
      attachStream: true,
      runCoaching: true,
      showTranscript: false,
      showCoaching: true,
    });
  });
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
