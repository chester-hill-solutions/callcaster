import { beforeEach, describe, expect, test, vi } from "vitest";
import { logger } from "@/lib/logger.server";
import { warnInvalidWorkspaceFeatureFlags } from "@/lib/workspace-feature-flags.server";

describe("stored workspace feature flag diagnostics", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test("names malformed known keys and workspace without stored values", () => {
    warnInvalidWorkspaceFeatureFlags("workspace-owned", {
      liveTranscription: "private-stored-value",
      liveCoaching: true,
      batchTranscription: null,
      operatorNote: "private-unknown-value",
    });
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith("workspace.feature_flags.invalid", {
      workspaceId: "workspace-owned",
      keys: ["liveTranscription", "batchTranscription"],
    });
  });

  test.each([
    { flags: null },
    { flags: undefined },
    { flags: {} },
    { flags: { liveTranscription: undefined } },
    { flags: { liveTranscription: false, liveCoaching: true, batchTranscription: false } },
    { flags: { unknownFlag: "private" } },
    { flags: [] },
  ])("normal missing flags and unknown fields produce no warning: $flags", ({ flags }) => {
    warnInvalidWorkspaceFeatureFlags("workspace-owned", flags);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
