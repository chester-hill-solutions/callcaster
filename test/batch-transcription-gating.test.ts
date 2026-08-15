import { beforeEach, describe, expect, test, vi } from "vitest";
import { WorkspaceFeatureFlags } from "@/lib/coaching-schemas";
import { batchTranscriptionKey } from "../shared/billing-keys";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  workspaceFindFirst: vi.fn(),
  callFindFirst: vi.fn(),
  insertTransactionHistoryIdempotent: vi.fn(),
  downloadObject: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    query: {
      workspace: { findFirst: (...a: unknown[]) => mocks.workspaceFindFirst(...a) },
      call: { findFirst: (...a: unknown[]) => mocks.callFindFirst(...a) },
    },
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: "transcript-1" }],
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));

vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...a: unknown[]) =>
    mocks.insertTransactionHistoryIdempotent(...a),
}));

vi.mock("@/lib/object-storage.server", () => ({
  downloadObject: (...a: unknown[]) => mocks.downloadObject(...a),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("batchTranscription feature flag", () => {
  test("defaults to false when absent — batch is off until product policy lands", () => {
    expect(WorkspaceFeatureFlags.parse({}).batchTranscription).toBe(false);
  });

  test("is independent of the live transcription and coaching flags", () => {
    const flags = WorkspaceFeatureFlags.parse({
      liveTranscription: true,
      liveCoaching: true,
    });
    expect(flags.batchTranscription).toBe(false);
  });

  test("can be turned on explicitly", () => {
    expect(WorkspaceFeatureFlags.parse({ batchTranscription: true }).batchTranscription).toBe(true);
  });
});

describe("elevenlabsBatchTranscribeHandler billing gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ELEVENLABS_API_KEY = "test-key";

    mocks.callFindFirst.mockResolvedValue({
      sid: "CA1",
      workspace: "w1",
      audio_url: "audio/CA1.mp3",
      transcript_id: null,
      recording_duration: "60",
    });
    mocks.downloadObject.mockResolvedValue(Buffer.from("audio"));
    mocks.insertTransactionHistoryIdempotent.mockResolvedValue({ inserted: true });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: "hello world", language_code: "en", words: [] }),
      }),
    );
  });

  test("does not bill when batchTranscription is off (the default)", async () => {
    mocks.workspaceFindFirst.mockResolvedValue({ feature_flags: {} });

    const { elevenlabsBatchTranscribeHandler } = await import(
      "@/lib/worker/handlers/elevenlabs-batch-transcribe.server"
    );
    const result = await elevenlabsBatchTranscribeHandler({
      params: { callSid: "CA1" },
    } as never);

    expect(result).toMatchObject({ status: "completed" });
    expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("bills with the canonical key once the flag is on", async () => {
    mocks.workspaceFindFirst.mockResolvedValue({
      feature_flags: { batchTranscription: true },
    });

    const { elevenlabsBatchTranscribeHandler } = await import(
      "@/lib/worker/handlers/elevenlabs-batch-transcribe.server"
    );
    await elevenlabsBatchTranscribeHandler({ params: { callSid: "CA1" } } as never);

    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledTimes(1);
    const args = mocks.insertTransactionHistoryIdempotent.mock.calls[0]?.[1] as {
      idempotencyKey: string;
      amount: number;
    };
    expect(args.idempotencyKey).toBe(batchTranscriptionKey("CA1"));
    expect(args.amount).toBeLessThan(0);
  });

  test("isBatchTranscriptionEnabled is false for an unknown workspace", async () => {
    mocks.workspaceFindFirst.mockResolvedValue(undefined);

    const { isBatchTranscriptionEnabled } = await import(
      "@/lib/worker/handlers/elevenlabs-batch-transcribe.server"
    );
    await expect(isBatchTranscriptionEnabled("missing")).resolves.toBe(false);
  });
});
