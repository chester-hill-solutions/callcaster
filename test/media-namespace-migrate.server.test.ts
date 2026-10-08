import { describe, expect, test, vi } from "vitest";
import {
  mediaNamespaceTarget,
  migrateWorkspaceMediaNamespaces,
  runMediaNamespaceMigrate,
  type MediaNamespaceMigrateDeps,
} from "../app/lib/media-namespace-migrate.server";

function deps(overrides: Partial<MediaNamespaceMigrateDeps> = {}): MediaNamespaceMigrateDeps {
  return {
    listWorkspaceIds: vi.fn(async () => ["w1", "w2"]),
    listLegacyObjects: vi.fn(async () => [
      "greeting.mp3",
      "voicemail-+15550001111-2026-09-22T10:00:00.000Z.mp3",
      "voicemail-undefined-2026-09-20T09:00:00.000Z.mp3",
      "recording-CA123.mp3",
    ]),
    copyObject: vi.fn(async () => undefined),
    deleteObject: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("mediaNamespaceTarget", () => {
  test("routes legacy voicemail and recording objects to their own namespaces", () => {
    expect(mediaNamespaceTarget("w1", "voicemail-+1555-x.mp3")).toBe(
      "voicemail/w1/voicemail-+1555-x.mp3",
    );
    expect(mediaNamespaceTarget("w1", "voicemail-undefined-x.mp3")).toBe(
      "voicemail/w1/voicemail-undefined-x.mp3",
    );
    expect(mediaNamespaceTarget("w1", "recording-CA123.mp3")).toBe(
      "call-recordings/w1/recording-CA123.mp3",
    );
  });

  test("leaves library prompts where they are", () => {
    expect(mediaNamespaceTarget("w1", "greeting.mp3")).toBeNull();
    expect(mediaNamespaceTarget("w1", "recorded-20260101.mp3")).toBeNull();
  });
});

describe("migrateWorkspaceMediaNamespaces", () => {
  test("moves only voicemail and call-recording objects out of the library prefix", async () => {
    const probe = deps();
    const result = await migrateWorkspaceMediaNamespaces("w1", probe, {
      dryRun: false,
    });

    expect(result.voicemails).toBe(2);
    expect(result.callRecordings).toBe(1);
    expect(result.failures).toEqual([]);
    expect(probe.copyObject).toHaveBeenCalledWith(
      "w1/voicemail-+15550001111-2026-09-22T10:00:00.000Z.mp3",
      "voicemail/w1/voicemail-+15550001111-2026-09-22T10:00:00.000Z.mp3",
    );
    expect(probe.copyObject).toHaveBeenCalledWith(
      "w1/recording-CA123.mp3",
      "call-recordings/w1/recording-CA123.mp3",
    );
    expect(probe.deleteObject).toHaveBeenCalledTimes(3);
    expect(probe.deleteObject).not.toHaveBeenCalledWith(
      "greeting.mp3",
    );
  });

  test("dry-run reports counts without touching objects", async () => {
    const probe = deps();
    const result = await migrateWorkspaceMediaNamespaces("w1", probe, {
      dryRun: true,
    });

    expect(result.voicemails).toBe(2);
    expect(result.callRecordings).toBe(1);
    expect(probe.copyObject).not.toHaveBeenCalled();
    expect(probe.deleteObject).not.toHaveBeenCalled();
  });

  test("records per-object failures without aborting the rest", async () => {
    const probe = deps({
      copyObject: vi.fn(async (source: string) => {
        if (source.startsWith("w1/voicemail-+")) throw new Error("copy boom");
      }),
    });
    const result = await migrateWorkspaceMediaNamespaces("w1", probe, {
      dryRun: false,
    });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].objectPath).toMatch(/voicemail-\+/);
    // The two other objects still moved.
    expect(probe.deleteObject).toHaveBeenCalledTimes(2);
  });
});

describe("runMediaNamespaceMigrate", () => {
  test("sums across workspaces and isolates a failing workspace", async () => {
    const probe = deps({
      listWorkspaceIds: vi.fn(async () => ["w1", "w2"]),
      listLegacyObjects: vi.fn(async (ws: string) =>
        ws === "w1" ? [] : ["recording-CA9.mp3"],
      ),
    });
    const result = await runMediaNamespaceMigrate(probe, { dryRun: false });

    expect(result.callRecordings).toBe(1);
    expect(result.voicemails).toBe(0);
    expect(result.errors).toEqual([]);
  });
});