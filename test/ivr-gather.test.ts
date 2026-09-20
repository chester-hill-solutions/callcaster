import { describe, expect, test } from "vitest";

import {
  ivrGatherAttributes,
  ivrSpeechHints,
  ivrStepGathersSpeech,
} from "@/lib/ivr-gather.server";

describe("ivr-gather (#1875)", () => {
  test("a keypad-only single-key menu gathers DTMF and submits on the first press", () => {
    const attrs = ivrGatherAttributes([
      { value: "1", label: "Lawn sign" },
      { value: "2", label: "Volunteer" },
    ]);
    expect(attrs.input).toEqual(["dtmf"]);
    expect(attrs.numDigits).toBe(1);
    expect(attrs.speechModel).toBeUndefined();
    expect(attrs.hints).toBeUndefined();
  });

  test("a keypad menu with multi-character keys does not set numDigits", () => {
    const attrs = ivrGatherAttributes([{ value: "10" }, { value: "11" }]);
    expect(attrs.input).toEqual(["dtmf"]);
    expect(attrs.numDigits).toBeUndefined();
  });

  test("a vx-any step gathers speech with a valid model/timeout pairing and hints", () => {
    const attrs = ivrGatherAttributes([
      { value: "1", label: "LawnSignRequest" },
      { value: "vx-any", label: "VolunteerInterest", content: "Volunteer Interest" },
    ]);
    expect(ivrStepGathersSpeech([{ value: "vx-any" }])).toBe(true);
    expect(attrs.input).toEqual(["dtmf", "speech"]);
    expect(attrs.speechModel).toBe("phone_call");
    // Twilio documents "auto" as invalid whenever a speechModel is set.
    expect(attrs.speechTimeout).toBe("3");
    expect(attrs.hints).toContain("Lawn Sign Request");
    expect(attrs.hints).toContain("Volunteer Interest");
    expect(attrs.numDigits).toBeUndefined();
  });

  test("hints humanize camelCase and de-duplicate case-insensitively", () => {
    expect(
      ivrSpeechHints([{ label: "Support" }, { label: "support" }, { content: "Support" }]),
    ).toBe("Support");
  });

  test("a step can override the gather wait, with the 5s default unchanged", () => {
    expect(ivrGatherAttributes([]).timeout).toBe(5);
    expect(ivrGatherAttributes([], { timeoutSeconds: 10 }).timeout).toBe(10);
  });
});
