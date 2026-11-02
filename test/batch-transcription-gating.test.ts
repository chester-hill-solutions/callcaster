import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { WorkspaceFeatureFlags } from "@/lib/coaching-schemas";

vi.hoisted(() => { process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test"; });
const mocks = vi.hoisted(() => ({ workspaceFindFirst: vi.fn(), callFindFirst: vi.fn(), download: vi.fn(),
  manifest: vi.fn(), publish: vi.fn() }));
vi.mock("@/server/admin-db", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/admin-db")>(),
  adminDb: { query: { workspace: { findFirst: mocks.workspaceFindFirst }, call: { findFirst: mocks.callFindFirst } } },
}));
vi.mock("@/server/voice-recording-batch.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/voice-recording-batch.server")>(), readVoiceCallRecordingManifest: mocks.manifest,
}));
vi.mock("@/server/voice-recording-publication.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/voice-recording-publication.server")>(), publishVoiceRecordingTranscript: mocks.publish,
}));
vi.mock("@/lib/object-storage.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/object-storage.server")>(), downloadObject: mocks.download,
}));

describe("batchTranscription feature flag", () => {
  test("defaults to false when absent — batch is off until product policy lands", () => {
    expect(WorkspaceFeatureFlags.parse({}).batchTranscription).toBe(false);
  });
  test("is independent of the live transcription and coaching flags", () => {
    expect(WorkspaceFeatureFlags.parse({ liveTranscription: true, liveCoaching: true }).batchTranscription).toBe(false);
  });
  test("can be turned on explicitly", () => {
    expect(WorkspaceFeatureFlags.parse({ batchTranscription: true }).batchTranscription).toBe(true);
  });
});

describe("batch worker publication adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFindFirst.mockReset();
    mocks.callFindFirst.mockReset().mockResolvedValue({ sid: "CA1", workspace: "w1", audio_url: "audio/CA1.mp3",
      transcript_id: null, recording_duration: "60" });
    mocks.download.mockReset().mockResolvedValue(Buffer.from("audio"));
    mocks.manifest.mockReset().mockResolvedValue({ state: "legacy" });
    mocks.publish.mockReset().mockResolvedValue({ status: "completed", transcriptId: "transcript-1", billed: true });
    vi.stubEnv("ELEVENLABS_API_KEY", "owned-adapter-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ text: "hello world", language_code: "en", words: [] })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  test("hands captured media and provider output to the atomic publication owner", async () => {
    const { elevenlabsBatchTranscribeHandler } = await import("@/lib/worker/handlers/elevenlabs-batch-transcribe.server");
    const result = await elevenlabsBatchTranscribeHandler({ params: { callSid: "CA1" } } as never);
    expect(result).toEqual({ status: "completed", transcriptId: "transcript-1" });
    expect(mocks.download).toHaveBeenCalledWith("workspaceAudio", "audio/CA1.mp3");
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({ workspaceId: "w1",
      source: { sid: "CA1", workspace: "w1", audio_url: "audio/CA1.mp3", transcript_id: null, recording_duration: "60" },
      manifest: { state: "legacy" }, transcript: { provider: "elevenlabs_scribe_v2", language: "en", full_text: "hello world",
        word_count: 2, duration_ms: 60000, metadata: { elevenlabsModel: "scribe_v2", wordCount: 0 } } });
  });
  test("pending media cannot reach storage, STT or publication", async () => {
    mocks.manifest.mockResolvedValue({ state: "pending", reason: "recording_assembly_required" });
    const { elevenlabsBatchTranscribeHandler } = await import("@/lib/worker/handlers/elevenlabs-batch-transcribe.server");
    expect(await elevenlabsBatchTranscribeHandler({ params: { callSid: "CA1" } } as never))
      .toEqual({ status: "skipped", reason: "recording_parts_pending" });
    expect(mocks.download).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
  });
  test("retains the publication owner's concurrent-delivery result", async () => {
    mocks.publish.mockResolvedValue({ status: "skipped", reason: "already_transcribed" });
    const { elevenlabsBatchTranscribeHandler } = await import("@/lib/worker/handlers/elevenlabs-batch-transcribe.server");
    expect(await elevenlabsBatchTranscribeHandler({ params: { callSid: "CA1" } } as never))
      .toEqual({ status: "skipped", reason: "already_transcribed" });
  });
  test.each([[undefined, false], [{ feature_flags: { batchTranscription: true } }, true]])("reads the existing workspace flag (%j)", async (row, enabled) => {
    mocks.workspaceFindFirst.mockResolvedValue(row);
    const { isBatchTranscriptionEnabled } = await import("@/lib/worker/handlers/elevenlabs-batch-transcribe.server");
    expect(await isBatchTranscriptionEnabled("w1")).toBe(enabled);
  });
});
