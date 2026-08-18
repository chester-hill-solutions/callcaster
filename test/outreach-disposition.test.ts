import { describe, expect, test } from "vitest";

import {
  canTransitionOutreachDisposition,
  DNC_DISPOSITION,
  formatDispositionLabel,
  isDncDisposition,
  normalizeDispositionOptions,
  shouldUpdateOutreachDisposition,
  TERMINAL_OUTREACH_DISPOSITIONS,
} from "../app/lib/outreach-disposition";

describe("outreach disposition helpers", () => {
  test("canTransitionOutreachDisposition allows when current is empty", () => {
    expect(canTransitionOutreachDisposition(null, "completed")).toBe(true);
    expect(canTransitionOutreachDisposition(undefined, "completed")).toBe(true);
    expect(canTransitionOutreachDisposition("", "completed")).toBe(true);
  });

  test("canTransitionOutreachDisposition blocks transitions away from terminal states", () => {
    expect(TERMINAL_OUTREACH_DISPOSITIONS.has("completed")).toBe(true);
    expect(canTransitionOutreachDisposition("completed", "failed")).toBe(false);
    // Transitioning to the same terminal state is allowed
    expect(canTransitionOutreachDisposition("completed", "completed")).toBe(true);
    // Case-insensitive
    expect(canTransitionOutreachDisposition("COMPLETED", "completed")).toBe(true);
  });

  test("shouldUpdateOutreachDisposition returns false for empty next, otherwise delegates", () => {
    expect(
      shouldUpdateOutreachDisposition({ currentDisposition: "in-progress", nextDisposition: null }),
    ).toBe(false);
    expect(
      shouldUpdateOutreachDisposition({ currentDisposition: "completed", nextDisposition: "failed" }),
    ).toBe(false);
    expect(
      shouldUpdateOutreachDisposition({
        currentDisposition: "in-progress",
        nextDisposition: "completed",
      }),
    ).toBe(true);
    expect(
      shouldUpdateOutreachDisposition({ currentDisposition: undefined, nextDisposition: "completed" }),
    ).toBe(true);
  });

  test("normalizeDispositionOptions returns sensible defaults for null/undefined jsonb", () => {
    expect(normalizeDispositionOptions(null)).toEqual([
      "answered",
      "no_answer",
      "busy",
      "voicemail",
      DNC_DISPOSITION,
    ]);
    expect(normalizeDispositionOptions(undefined)).toEqual([
      "answered",
      "no_answer",
      "busy",
      "voicemail",
      DNC_DISPOSITION,
    ]);
  });

  test("normalizeDispositionOptions returns sensible defaults for non-array jsonb values", () => {
    expect(normalizeDispositionOptions("answered")).toEqual([
      "answered",
      "no_answer",
      "busy",
      "voicemail",
      DNC_DISPOSITION,
    ]);
    expect(normalizeDispositionOptions(42)).toEqual([
      "answered",
      "no_answer",
      "busy",
      "voicemail",
      DNC_DISPOSITION,
    ]);
    expect(normalizeDispositionOptions({ answered: true })).toEqual([
      "answered",
      "no_answer",
      "busy",
      "voicemail",
      DNC_DISPOSITION,
    ]);
  });

  test("normalizeDispositionOptions keeps only string entries and appends do_not_call last", () => {
    expect(normalizeDispositionOptions(["answered", "no_answer"])).toEqual([
      "answered",
      "no_answer",
      DNC_DISPOSITION,
    ]);
    expect(normalizeDispositionOptions(["answered", null, 3, { a: 1 }, "busy"])).toEqual([
      "answered",
      "busy",
      DNC_DISPOSITION,
    ]);
    expect(normalizeDispositionOptions([])).toEqual([
      "answered",
      "no_answer",
      "busy",
      "voicemail",
      DNC_DISPOSITION,
    ]);
  });

  test("normalizeDispositionOptions does not duplicate campaign-defined DNC variants", () => {
    expect(normalizeDispositionOptions(["answered", "do_not_call"])).toEqual([
      "answered",
      "do_not_call",
    ]);
    expect(normalizeDispositionOptions(["Do Not Call"])).toEqual(["Do Not Call"]);
    expect(normalizeDispositionOptions(["do-not-call", "busy"])).toEqual([
      "do-not-call",
      "busy",
    ]);
  });

  test("isDncDisposition matches raw value, label, and casing/separator variants", () => {
    expect(isDncDisposition(DNC_DISPOSITION)).toBe(true);
    expect(isDncDisposition("Do not call")).toBe(true);
    expect(isDncDisposition("DO-NOT-CALL")).toBe(true);
    expect(isDncDisposition(" do_not_call ")).toBe(true);
    expect(isDncDisposition("completed")).toBe(false);
    expect(isDncDisposition(null)).toBe(false);
    expect(isDncDisposition(undefined)).toBe(false);
    expect(isDncDisposition("")).toBe(false);
  });

  test("formatDispositionLabel maps known dispositions to title-cased labels and passes unknown strings through", () => {
    expect(formatDispositionLabel("do_not_call")).toBe("Do Not Call");
    expect(formatDispositionLabel("Do Not Call")).toBe("Do Not Call");
    expect(formatDispositionLabel("answered")).toBe("Answered");
    expect(formatDispositionLabel("no_answer")).toBe("No Answer");
    expect(formatDispositionLabel("busy")).toBe("Busy");
    expect(formatDispositionLabel("voicemail")).toBe("Voicemail");
    expect(formatDispositionLabel("custom_value")).toBe("custom_value");
  });
});

