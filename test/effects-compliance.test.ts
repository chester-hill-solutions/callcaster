import { describe, expect, test } from "vitest";

import { isEffectCompliant } from "../scripts/lib/effects-lib.mjs";

// The effects gate's compliance rule (#1924): an effect must answer
// @effect-why-not-loader in writing, or carry the CANDIDATE-REMOVE marker.
// These tests would fail if the why-or-candidate disjunction were inverted.

function tags(overrides = {}) {
  return {
    "@effect": "Do the thing once.",
    "@effect-deps": "x (starts the timer)",
    "@effect-side-effects": "timer (setInterval); cleared on unmount",
    "@effect-why-not-loader": "Live client state after a mutation; a loader cannot observe it.",
    ...overrides,
  };
}

describe("isEffectCompliant", () => {
  test("accepts an effect with a real why-not-loader answer", () => {
    expect(isEffectCompliant(tags())).toBe(true);
  });

  test("rejects an effect missing a required tag", () => {
    expect(isEffectCompliant(tags({ "@effect-side-effects": "" }))).toBe(false);
  });

  test("rejects an effect that dodges the why-not-loader question", () => {
    expect(isEffectCompliant(tags({ "@effect-why-not-loader": "" }))).toBe(false);
  });

  test("accepts the CANDIDATE-REMOVE escape hatch for an unanswered why", () => {
    expect(
      isEffectCompliant(
        tags({
          "@effect": "CANDIDATE-REMOVE: mirror loader data into state",
          "@effect-why-not-loader": "",
        }),
      ),
    ).toBe(true);
  });

  test("does not treat a plain purpose as the escape hatch", () => {
    expect(
      isEffectCompliant(
        tags({
          "@effect": "Mirror loader data into state",
          "@effect-why-not-loader": "",
        }),
      ),
    ).toBe(false);
  });
});