import { describe, expect, test } from "vitest";

import { isOptOutMessage, parseOptOutKeywords } from "../app/lib/chat-opt-out";

const requiredKeywords = [
  "STOP",
  "UNSUBSCRIBE",
  "END",
  "QUIT",
  "STOPALL",
  "REVOKE",
  "OPTOUT",
  "CANCEL",
  "OPT OUT",
];

describe("chat opt-out helpers", () => {
  test.each([null, undefined, "", " , \n"])(
    "keeps the mandatory set with empty configuration %s",
    (value) => {
      expect(parseOptOutKeywords(value)).toEqual(requiredKeywords);
    },
  );

  test("normalizes and unions custom keywords without duplicates", () => {
    expect(
      parseOptOutKeywords("stop, leave   me alone\nUNSUBSCRIBE,LEAVE ME ALONE"),
    ).toEqual([
      "STOP",
      "UNSUBSCRIBE",
      "END",
      "QUIT",
      "STOPALL",
      "REVOKE",
      "OPTOUT",
      "CANCEL",
      "OPT OUT",
      "LEAVE ME ALONE",
    ]);
  });

  describe.each(["", "STOP", "LEAVE ME ALONE"])(
    "configured keywords %s",
    (configured) => {
      test.each(requiredKeywords)(
        "honours %s after parsing configuration",
        (keyword) => {
          expect(
            isOptOutMessage(
              ` \t${keyword.toLowerCase()}  `,
              parseOptOutKeywords(configured),
            ),
          ).toBe(true);
          expect(parseOptOutKeywords(configured)).toContain(keyword);
        },
      );
    },
  );

  test.each(requiredKeywords)(
    "direct matching cannot remove mandatory %s",
    (keyword) => {
      expect(isOptOutMessage(keyword, ["LEAVE ME ALONE"])).toBe(true);
    },
  );

  test("matches custom multiword keywords after case and whitespace normalization", () => {
    expect(isOptOutMessage(" leave\t me  alone ", [" Leave Me Alone "])).toBe(
      true,
    );
    expect(isOptOutMessage(" opt\t out ", [])).toBe(true);
  });

  test.each([
    null,
    undefined,
    "",
    "   ",
    "hello",
    "STOP please",
    "please stop",
    "STOPALL NOW",
    "OPT OUT NOW",
    "START",
  ])("does not match ordinary message %s", (body) => {
    expect(isOptOutMessage(body, parseOptOutKeywords("LEAVE ME ALONE"))).toBe(
      false,
    );
  });

  test("callers cannot mutate the defaults through a parser result", () => {
    const first = parseOptOutKeywords(null);
    first.splice(0);
    expect(parseOptOutKeywords(null)).toEqual(requiredKeywords);
    expect(isOptOutMessage("stop", [])).toBe(true);
  });
});
