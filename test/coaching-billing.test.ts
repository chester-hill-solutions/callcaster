import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  batchTranscriptionKey,
  bucketFromIdempotencyKey,
  coachingCueKey,
  liveTranscriptionKey,
} from "../shared/billing-keys";
import { TRANSCRIPTION_RATE_CREDITS } from "../shared/billing-rates";

const ledgerMocks = vi.hoisted(() => ({
  insertTransactionHistoryIdempotent: vi.fn(),
}));

vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: unknown[]) =>
    ledgerMocks.insertTransactionHistoryIdempotent(...args),
}));

describe("billing key classification", () => {
  test.each([
    ["live transcription", liveTranscriptionKey("CA123"), "transcription:CA123"],
    ["batch transcription", batchTranscriptionKey("CA123"), "transcription_batch:CA123"],
    ["coaching cue", coachingCueKey("CA123", "evt-1"), "coaching:CA123:evt-1"],
  ])("%s key has a stable shape", (_label, actual, expected) => {
    expect(actual).toBe(expected);
  });

  test.each([
    ["live transcription", liveTranscriptionKey("CA123")],
    ["batch transcription", batchTranscriptionKey("CA123")],
    ["coaching cue", coachingCueKey("CA123", "evt-1")],
  ])("%s classifies into the ai bucket, not other", (_label, key) => {
    expect(bucketFromIdempotencyKey(key)).toBe("ai");
  });

  test("ai keys do not leak into the voice bucket that is reconciled against Twilio", () => {
    expect(bucketFromIdempotencyKey(liveTranscriptionKey("CA123"))).not.toBe("voice");
    expect(bucketFromIdempotencyKey("call:CA123")).toBe("voice");
  });

  test("batch keys are not swallowed by the live transcription prefix", () => {
    expect(batchTranscriptionKey("CA1").startsWith("transcription:")).toBe(false);
    expect(liveTranscriptionKey("CA1")).not.toBe(batchTranscriptionKey("CA1"));
  });

  test("pre-existing buckets are unchanged", () => {
    expect(bucketFromIdempotencyKey("sms:SM1")).toBe("sms");
    expect(bucketFromIdempotencyKey("number_rent:1:2026-07")).toBe("numbers");
    expect(bucketFromIdempotencyKey("stripe_evt:evt_1")).toBe("purchase");
    expect(bucketFromIdempotencyKey("something-else")).toBe("other");
    expect(bucketFromIdempotencyKey(null)).toBe("other");
  });
});

describe("coaching-billing", () => {
  beforeEach(() => {
    ledgerMocks.insertTransactionHistoryIdempotent.mockReset();
    ledgerMocks.insertTransactionHistoryIdempotent.mockResolvedValue({ inserted: true });
  });

  test("liveTranscriptionCredits rounds a partial minute up", async () => {
    const { liveTranscriptionCredits } = await import(
      "../services/media-stream/coaching-billing"
    );
    expect(liveTranscriptionCredits(60_000)).toBe(Math.ceil(TRANSCRIPTION_RATE_CREDITS));
    expect(liveTranscriptionCredits(10 * 60_000)).toBe(Math.ceil(10 * TRANSCRIPTION_RATE_CREDITS));
  });

  test.each([
    ["zero duration", 0],
    ["negative duration", -5_000],
    ["NaN duration", Number.NaN],
  ])("%s bills nothing rather than a zero/negative debit", async (_label, durationMs) => {
    const { billLiveTranscription } = await import(
      "../services/media-stream/coaching-billing"
    );

    await expect(
      billLiveTranscription({ workspaceId: "ws-1", callSid: "CA123", durationMs }),
    ).resolves.toEqual({ billed: false, credits: 0 });
    expect(ledgerMocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("live transcription debit is negative and uses the canonical key", async () => {
    const { billLiveTranscription } = await import(
      "../services/media-stream/coaching-billing"
    );

    await billLiveTranscription({
      workspaceId: "ws-1",
      callSid: "CA123",
      durationMs: 5 * 60_000,
    });

    const args = ledgerMocks.insertTransactionHistoryIdempotent.mock.calls[0]?.[1] as {
      amount: number;
      idempotencyKey: string;
      type: string;
    };
    expect(args.type).toBe("DEBIT");
    expect(args.amount).toBeLessThan(0);
    expect(args.idempotencyKey).toBe(liveTranscriptionKey("CA123"));
  });

  test("cue billing is keyed per coaching_event row so each cue charges once", async () => {
    const { billCoachingCue } = await import("../services/media-stream/coaching-billing");

    await billCoachingCue({ workspaceId: "ws-1", callSid: "CA123", eventId: "evt-1" });
    await billCoachingCue({ workspaceId: "ws-1", callSid: "CA123", eventId: "evt-1" });
    await billCoachingCue({ workspaceId: "ws-1", callSid: "CA123", eventId: "evt-2" });

    const keys = ledgerMocks.insertTransactionHistoryIdempotent.mock.calls.map(
      (call) => (call[1] as { idempotencyKey: string }).idempotencyKey,
    );
    // Two writes for evt-1 collapse on one key (the ledger RPC dedupes on it);
    // a distinct cue gets a distinct key and is charged separately.
    expect(keys).toEqual([
      coachingCueKey("CA123", "evt-1"),
      coachingCueKey("CA123", "evt-1"),
      coachingCueKey("CA123", "evt-2"),
    ]);
    expect(new Set(keys).size).toBe(2);
  });

  /**
   * The old assertion here was `expect(amount).toBeLessThan(0)`, which `-0.1`
   * satisfies. That is why #2101 survived: the test checked the sign, and the
   * defect was the fraction. Credits are `integer` end to end, so `-0.1` dies at
   * the ledger RPC with `invalid input syntax for type integer` and every cue
   * went unbilled with the error swallowed.
   *
   * Asserting the exact value makes the quantisation visible, so a future change
   * to the rate has to be a deliberate edit here rather than a silent one.
   */
  test("cue debit is a whole negative credit", async () => {
    const { billCoachingCue } = await import("../services/media-stream/coaching-billing");
    await billCoachingCue({ workspaceId: "ws-1", callSid: "CA123", eventId: "evt-1" });

    const args = ledgerMocks.insertTransactionHistoryIdempotent.mock.calls[0]?.[1] as {
      amount: number;
    };
    expect(Number.isInteger(args.amount)).toBe(true);
    expect(args.amount).toBe(-1);
  });

  test("a fractional rate reaching a debit helper is a build failure", async () => {
    // The guard is scripts/check-credit-write-paths.mjs, which is in ci:local.
    // This asserts the helper itself refuses to emit a fraction, so the invariant
    // holds even if a future caller bypasses the lint rule.
    const { wholeCreditDebit } = await import("../shared/pricing");
    expect(wholeCreditDebit(0.1)).toBe(-1);
    expect(wholeCreditDebit(0.4)).toBe(-1);
    expect(wholeCreditDebit(0.6)).toBe(-1);
    expect(Number.isInteger(wholeCreditDebit(0.1))).toBe(true);
    // Never a zero debit: Math.round(0.1) is 0, and a zero row moves no credits
    // while looking like a success.
    expect(wholeCreditDebit(0.1)).not.toBe(0);
    expect(wholeCreditDebit(2.4)).toBe(-2);
    expect(wholeCreditDebit(-0.1)).toBe(-1);
  });
});
