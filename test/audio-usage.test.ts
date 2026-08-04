import { describe, expect, test } from "vitest";

import { resolveAvailableBaseName } from "../app/lib/audio-upload";
import { getScriptAudioReferences } from "../app/lib/database/audio-usage.server";

describe("resolveAvailableBaseName", () => {
  test("keeps the desired name when it is free", () => {
    expect(resolveAvailableBaseName("intro", [])).toBe("intro");
    expect(resolveAvailableBaseName("intro", ["outro"])).toBe("intro");
  });

  test("suffixes past every taken name rather than overwriting", () => {
    expect(resolveAvailableBaseName("intro", ["intro"])).toBe("intro-2");
    expect(resolveAvailableBaseName("intro", ["intro", "intro-2"])).toBe(
      "intro-3",
    );
    expect(
      resolveAvailableBaseName("intro", ["intro", "intro-2", "intro-3"]),
    ).toBe("intro-4");
  });

  test("treats names case-insensitively", () => {
    // S3 keys are case-sensitive, but "Intro" and "intro" are the same
    // recording to a user — and a near-miss here silently shadows a file a
    // live campaign points at.
    expect(resolveAvailableBaseName("Intro", ["intro"])).toBe("Intro-2");
    expect(resolveAvailableBaseName("intro", [" INTRO "])).toBe("intro-2");
  });

  test("skips gaps without reusing a taken name", () => {
    expect(resolveAvailableBaseName("intro", ["intro", "intro-3"])).toBe(
      "intro-2",
    );
  });
});

describe("getScriptAudioReferences", () => {
  test("finds filenames under the documented audioFile key", () => {
    const script = {
      blocks: {
        b1: { callcasterType: "recorded", audioFile: "intro.mp3" },
        b2: { callcasterType: "synthetic", audioFile: "Hello there" },
      },
    };
    expect(getScriptAudioReferences(script)).toContain("intro.mp3");
  });

  test("finds filenames under the legacy say key", () => {
    // getRecordingFileNames() in workspace-media.server.ts reads `say` from a
    // flat array, not `audioFile` from {pages, blocks}. Both shapes exist.
    const legacy = [
      { speechType: "recorded", say: "legacy-prompt.mp3" },
      { speechType: "synthetic", say: "spoken text" },
    ];
    expect(getScriptAudioReferences(legacy)).toContain("legacy-prompt.mp3");
  });

  test("walks nested pages and blocks", () => {
    const nested = {
      pages: { p1: { blocks: ["b1"] } },
      blocks: {
        b1: {
          options: [{ next: "p2" }],
          audioFile: "deep.mp3",
        },
      },
    };
    expect(getScriptAudioReferences(nested)).toEqual(["deep.mp3"]);
  });

  test("ignores blank values and non-audio keys", () => {
    const script = {
      blocks: {
        b1: { audioFile: "   ", title: "not-audio.mp3", say: "" },
      },
    };
    expect(getScriptAudioReferences(script)).toEqual([]);
  });

  test("tolerates null, primitives, and empty input", () => {
    expect(getScriptAudioReferences(null)).toEqual([]);
    expect(getScriptAudioReferences(undefined)).toEqual([]);
    expect(getScriptAudioReferences("string")).toEqual([]);
    expect(getScriptAudioReferences(42)).toEqual([]);
    expect(getScriptAudioReferences({})).toEqual([]);
  });

  test("deduplicates a filename reused across blocks", () => {
    const script = {
      blocks: {
        b1: { audioFile: "shared.mp3" },
        b2: { say: "shared.mp3" },
      },
    };
    expect(getScriptAudioReferences(script)).toEqual(["shared.mp3"]);
  });
});
