import { describe, expect, test } from "vitest";

import {
  canTransitionOutreachDisposition,
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
});

