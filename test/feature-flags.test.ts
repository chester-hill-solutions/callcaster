import { describe, expect, test } from "bun:test";
import {
  CoachingConfig,
  WorkspaceFeatureFlags,
  TranscriptMetadata,
  CoachingEventPayload,
} from "@/lib/coaching-schemas";
import { coachingEnabled, hasFeatureFlag } from "@/lib/feature-flags";

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
  test("hasFeatureFlag / coachingEnabled", () => {
    expect(hasFeatureFlag(null, "liveTranscription")).toBe(false);
    expect(hasFeatureFlag({ liveTranscription: true }, "liveTranscription")).toBe(true);
    expect(coachingEnabled({ liveCoaching: true })).toBe(true);
    expect(coachingEnabled({})).toBe(false);
  });
});
