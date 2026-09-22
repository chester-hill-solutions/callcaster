import { describe, expect, test, vi } from "vitest";
import {
  backfillWorkspaceWavs,
  runWavBackfill,
  type WavBackfillDeps,
} from "../app/lib/wav-backfill.server";

function deps(overrides: Partial<WavBackfillDeps> = {}): WavBackfillDeps {
  return {
    listWorkspaceIds: vi.fn(async () => ["w1", "w2"]),
    listPromptObjects: vi.fn(async () => [
      "greeting.mp3",
      "prompt.wav",
      "recorded-20260101.mp3",
      "recording-CA123.mp3",
      "voicemail-CA456.mp3",
    ]),
    sidecarExists: vi.fn(async () => false),
    writeSidecar: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("backfillWorkspaceWavs (#1842)", () => {
  test("filters prompts (no .wav, no recording-*, no voicemail) and counts candidates", async () => {
    const probe = deps();
    const result = await backfillWorkspaceWavs("w1", probe);

    // greeting + recorded-* are prompts; prompt.wav / recording- / voicemail- are not.
    expect(result.scanned).toBe(2);
    expect(probe.writeSidecar).toHaveBeenCalledTimes(2);
    expect(result.created).toBe(2);
    expect(probe.writeSidecar).toHaveBeenCalledWith("w1", "recorded-20260101.mp3");
  });

  test("skips existing sidecars unless --force", async () => {
    const probe = deps({
      sidecarExists: vi.fn(async (ws: string, name: string) => name === "greeting.mp3"),
    });
    const skipped = await backfillWorkspaceWavs("w1", probe, {});
    expect(skipped.skippedExisting).toBe(1);
    expect(skipped.created).toBe(1);

    const forced = await backfillWorkspaceWavs("w1", probe, { force: true });
    expect(forced.skippedExisting).toBe(0);
    expect(forced.created).toBe(2);
  });

  test("dry-run reports would-be creation without writing", async () => {
    const probe = deps();
    const result = await backfillWorkspaceWavs("w1", probe, { dryRun: true });
    expect(result.created).toBe(2);
    expect(probe.writeSidecar).not.toHaveBeenCalled();
  });

  test("honors the per-workspace limit", async () => {
    const probe = deps();
    const limited = await backfillWorkspaceWavs("w1", probe, { limit: 1 });
    expect(limited.created).toBe(1);
    expect(probe.writeSidecar).toHaveBeenCalledTimes(1);
  });

  test("records per-file failures instead of aborting the run", async () => {
    const probe = deps({
      writeSidecar: vi.fn(async (ws: string, name: string) => {
        if (name === "greeting.mp3") throw new Error("ffmpeg boom");
      }),
    });
    const result = await backfillWorkspaceWavs("w1", probe);
    expect(result.created).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].fileName).toBe("greeting.mp3");
    expect(result.failures[0].error).toBe("ffmpeg boom");
  });

  test("runWavBackfill isolates a workspace whose scan throws", async () => {
    const probe = deps({
      listPromptObjects: vi.fn(async (id: string) => {
        if (id === "w2") throw new Error("s3 down");
        return ["greeting.mp3"];
      }),
    });
    const result = await runWavBackfill(probe);
    expect(result.workspaces).toHaveLength(1);
    expect(result.errors).toEqual(["w2: s3 down"]);
    expect(result.created).toBe(1);
  });
});