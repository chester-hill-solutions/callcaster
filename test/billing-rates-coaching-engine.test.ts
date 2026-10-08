import { describe, expect, test } from "vitest";
import {
  COACHING_CUE_CREDITS,
  TRANSCRIPTION_BATCH_CREDITS,
  TRANSCRIPTION_RATE_CREDITS,
} from "../shared/billing-rates";
import { computeWpm, createCoachingState } from "../services/media-stream/coaching-state";
import { wholeCreditDebit } from "../shared/pricing";

/**
 * The rate card may hold fractional *rates*; what it may not hand to the ledger
 * is a fractional amount. Credits are `integer` end to end — `workspace.credits`,
 * `transaction_history.amount`, and the RPC's `p_amount` — so a raw `-0.1`
 * reaches Postgres as `invalid input syntax for type integer` and every coaching
 * cue went unbilled (#2101).
 *
 * The assertion that used to be here was `COACHING_CUE_CREDITS === 0.1`. It
 * pinned the number and never exercised the write, which is precisely how the
 * mismatch survived: the constant was "correct" and the ledger was unreachable.
 * What matters is the *debit*, so that is what is asserted.
 */
describe("billing-rates", () => {
  test("exports stable credit constants", () => {
    expect(TRANSCRIPTION_RATE_CREDITS).toBe(0.43);
    expect(COACHING_CUE_CREDITS).toBe(0.1);
    expect(TRANSCRIPTION_BATCH_CREDITS).toBe(1);
  });

  // One case per rate, so a failure names the offending rate rather than
  // "index 1". Not a tautology: these are the literal rate-card values, read
  // from the module, pushed through the same helper the ledger write uses. Add a
  // rate whose quantised debit is not a whole credit and its case goes red.
  test.each([
    ["COACHING_CUE_CREDITS", COACHING_CUE_CREDITS],
    ["TRANSCRIPTION_RATE_CREDITS", TRANSCRIPTION_RATE_CREDITS],
    ["TRANSCRIPTION_BATCH_CREDITS", TRANSCRIPTION_BATCH_CREDITS],
  ])("%s debits a whole, negative, non-zero credit", (_name, rate) => {
    const debit = wholeCreditDebit(rate);
    expect(Number.isInteger(debit)).toBe(true);
    expect(debit).toBeLessThan(0);
    expect(debit).not.toBe(0);
  });

  test("the coaching cue bills 1 credit against a 0.1-credit rate", () => {
    // Stated as its own test so the 10x is a visible, deliberate number rather
    // than something a future reader has to reconstruct. Whole credits is the
    // chosen model; sub-credit pricing would need `numeric` columns and a
    // `numeric` RPC parameter. See the note on COACHING_CUE_CREDITS.
    expect(wholeCreditDebit(COACHING_CUE_CREDITS)).toBe(-1);
  });
});

describe("coaching-engine", () => {
  test("createCoachingState initializes counters", () => {
    const state = createCoachingState({
      callSid: "CA123",
      workspaceId: "ws-1",
      direction: "outbound",
      config: {
        fillerWords: ["uh"],
        wpmMin: 120,
        wpmMax: 160,
        pauseThresholdMs: 1500,
        llmCadenceMs: 30_000,
        llmPersona: "coach",
        disclosureEnabled: false,
      },
    });
    expect(state.fillerTotal).toBe(0);
    expect(state.pauseTotal).toBe(0);
  });

  test("computeWpm derives words per minute from rolling window", () => {
    expect(computeWpm({ words: 150, ms: 60_000 })).toBe(150);
    expect(computeWpm({ words: 0, ms: 0 })).toBe(0);
  });
});
