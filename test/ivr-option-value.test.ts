import { describe, expect, test } from "vitest";

import {
  findIvrMatchedOption,
  ivrOptionLabel,
  ivrOptionValue,
  resolveIvrOptionLabel,
} from "@/lib/ivr-option-value";
import { ivrSingleKeyDigits, ivrStepGathersSpeech } from "@/lib/ivr-gather.server";
import { resolveIvrAnswerLabel } from "@/lib/ivr-results";

/**
 * #2146: the documented script format ([docs/script-json-format.md]) defines an
 * option as `content` plus `next` — there is no `value` field. Every reader that
 * consulted only `option.value` therefore matched nothing in a
 * documented-format script.
 *
 * The failure was silent because the fall-through is reasonable: an unmatched
 * press walks the linear chain, which is what a non-interactive block does
 * anyway. So an author's branch was declared, passed validation, and never ran.
 *
 * These tests are written against the *documented* shape, because that is the
 * shape that was broken. A test written against `value` would have passed before
 * the fix and proved nothing.
 */
const documentedOption = {
  content: "Yes",
  next: "block_3",
};

const editorOption = {
  value: "1",
  label: "Yes",
  next: "block_3",
};

describe("ivr option value — the documented shape has no `value`", () => {
  test("a documented option's value is its text", () => {
    expect(ivrOptionValue(documentedOption)).toBe("Yes");
  });

  test("an explicit value wins over the text when both are present", () => {
    // The editor's shape: `value` is the key-to-press mapping, so it is the one
    // a caller actually pressed. Falling back to the text first would match
    // "Yes" when the caller pressed "1".
    expect(ivrOptionValue({ value: "1", content: "Yes" })).toBe("1");
  });

  test("a blank explicit value falls back to the text", () => {
    // `value: ""` is what a form submits for an unfilled field. Treating it as
    // authoritative would make the option unmatchable.
    expect(ivrOptionValue({ value: "", content: "Yes" })).toBe("Yes");
    expect(ivrOptionValue({ value: "   ", content: "Yes" })).toBe("Yes");
  });

  test("a missing option is the empty value, not a crash", () => {
    expect(ivrOptionValue(null)).toBe("");
    expect(ivrOptionValue(undefined)).toBe("");
    expect(ivrOptionValue({})).toBe("");
  });

  test("a numeric value is read, not stringified as [object]", () => {
    expect(ivrOptionValue({ value: 2 })).toBe("2");
  });
});

describe("ivr option matching — the matcher that was silently failing", () => {
  test("a documented option matches its own text", () => {
    expect(findIvrMatchedOption([documentedOption], "Yes")).toEqual(documentedOption);
  });

  test("a documented option matches case-insensitively via the trim", () => {
    // Twilio sends the digits as pressed; the stored text is what the author
    // typed. Surrounding whitespace is trimmed on both sides.
    expect(findIvrMatchedOption([{ content: " Yes ", next: "b" }], "Yes")).toBeTruthy();
  });

  test("an unmatched press returns nothing rather than the first option", () => {
    // The old `.find` could not distinguish "no match" from a match on an
    // empty value, so a shape with no `value` at all had to be guarded here.
    expect(findIvrMatchedOption([documentedOption], "maybe")).toBeUndefined();
  });

  test("empty input matches nothing, so the linear chain runs", () => {
    // A timeout submits an empty Digits parameter. Matching that against an
    // option with no value would consume a timeout as a real answer.
    expect(findIvrMatchedOption([documentedOption], "")).toBeUndefined();
    expect(findIvrMatchedOption([documentedOption], "   ")).toBeUndefined();
    expect(findIvrMatchedOption([documentedOption], null)).toBeUndefined();
  });

  test("no options is no match, not a crash", () => {
    expect(findIvrMatchedOption([], "1")).toBeUndefined();
    expect(findIvrMatchedOption(undefined, "1")).toBeUndefined();
    expect(findIvrMatchedOption(null, "1")).toBeUndefined();
  });

  test("the editor shape still matches on its digit", () => {
    expect(findIvrMatchedOption([editorOption], "1")).toEqual(editorOption);
  });

  test("vx-any only matches input longer than a keypress", () => {
    const any = { value: "vx-any", label: "anything", next: "b" };
    expect(findIvrMatchedOption([any], "I would like to speak to someone")).toEqual(any);
    // A keypress is one character and must not be swallowed by the catch-all.
    expect(findIvrMatchedOption([any], "1")).toBeUndefined();
  });

  test("vx-any stored as content is still found", () => {
    // The documented shape carries no `value`, so a spoken catch-all written
    // through the API was invisible and the gather stopped gathering speech.
    const any = { content: "vx-any", next: "b" };
    expect(findIvrMatchedOption([any], "please help me")).toEqual(any);
  });
});

describe("ivr option labels — what the caller is shown", () => {
  test("a documented option's label is its text", () => {
    expect(ivrOptionLabel(documentedOption)).toBe("Yes");
  });

  test("an explicit label wins over the text for display", () => {
    // Deliberately the opposite order from `ivrOptionValue`: a label is what the
    // author wrote to be shown.
    expect(ivrOptionLabel({ value: "1", label: "Yes, call me", content: "Yes" })).toBe(
      "Yes, call me",
    );
  });

  test("a recorded answer resolves to the option's text, not the raw digit", () => {
    // Before the fix this returned the digit, so Results and the CSV export
    // showed "Yes" callers as "1".
    expect(resolveIvrOptionLabel([documentedOption], "Yes")).toBe("Yes");
  });

  test("an unmatched answer falls back to itself", () => {
    // A renamed or removed option must still show something.
    expect(resolveIvrOptionLabel([documentedOption], "7")).toBe("7");
    expect(resolveIvrOptionLabel([], "7")).toBe("7");
  });
});

describe("ivr gather attributes — reading a documented option's value", () => {
  test("a spoken catch-all stored as content still gathers speech", () => {
    expect(ivrStepGathersSpeech([{ content: "vx-any", next: "b" }])).toBe(true);
  });

  test("a keypad-only menu still submits on the first press", () => {
    // Single-character values, which is the case this optimisation is for. A
    // documented-format option holding the word "Yes" is three characters, so
    // the gather correctly waits out its timeout instead — the digit is what a
    // caller presses, and the text is only a label.
    expect(ivrSingleKeyDigits([{ value: "1", next: "b3" }, { value: "2", next: "b4" }])).toBe(
      1,
    );
  });

  test("a documented-format menu does not claim one-key submission", () => {
    // The counterpart to the case above, and the one the shared reader
    // actually decides. With a `value`-only lookup, a documented option reads as
    // "" and this is `undefined`; through `ivrOptionValue` the text is read, and
    // "Yes" is three characters — so the two answers agree by accident.
    //
    // The case where they disagree is a documented option whose text IS a single
    // key, which is what a script author writes when the option doubles as the
    // digit. Only the shared reader sees that it is one character.
    expect(ivrSingleKeyDigits([{ content: "1", next: "b3" }, { content: "2", next: "b4" }])).toBe(
      1,
    );
  });

  test("a menu with no single-key values does not claim one-key submission", () => {
    // Both options are words, so the gather must wait out the timeout.
    expect(
      ivrSingleKeyDigits([
        { content: "Yes please", next: "b3" },
        { content: "No thank you", next: "b4" },
      ]),
    ).toBeUndefined();
  });
});

describe("resolveIvrAnswerLabel — the reader the Results screen and export use", () => {
  const script = {
    pages: { page_1: { blocks: ["block_1", "block_2"] } },
    blocks: {
      block_1: {
        title: "Is this a good time to talk?",
        options: [
          { content: "Yes", next: "block_2" },
          { content: "No", next: "hangup" },
        ],
      },
    },
  };

  test("a documented-format script shows the option text", () => {
    expect(
      resolveIvrAnswerLabel(script, "Is this a good time to talk?", "Yes"),
    ).toBe("Yes");
    expect(resolveIvrAnswerLabel(script, "Is this a good time to talk?", "No")).toBe(
      "No",
    );
  });

  test("an editor-format script still shows its label", () => {
    const editorScript = {
      blocks: {
        block_1: {
          title: "Is this a good time to talk?",
          options: [{ value: "1", label: "Yes, definitely", next: "block_2" }],
        },
      },
    };
    expect(
      resolveIvrAnswerLabel(editorScript, "Is this a good time to talk?", "1"),
    ).toBe("Yes, definitely");
  });

  test("an answer with no matching option falls back to the raw value", () => {
    // The block or option was renamed after the call. Under-reporting is worse
    // than showing a stale label, so the value stands.
    expect(resolveIvrAnswerLabel(script, "Is this a good time to talk?", "9")).toBe("9");
  });

  test("an unknown question falls back to the raw value", () => {
    expect(resolveIvrAnswerLabel(script, "A question that no longer exists", "Yes")).toBe(
      "Yes",
    );
  });
});
