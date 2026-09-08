import { describe, expect, test } from "vitest";
import {
  formatNumberLocality,
  formatNumberLocation,
} from "@/lib/number-locality";

describe("app/lib/number-locality.ts", () => {
  test("maps Twilio's title-cased Ajax/Pickering rate centre to its real name (#1321)", () => {
    // Twilio returns "Ajaxpickering" for numbers in the Ajax–Pickering rate
    // centre: a single leading capital, so no CamelCase boundary to split on.
    expect(formatNumberLocality("Ajaxpickering")).toBe("Ajax-Pickering");
    expect(formatNumberLocality("AJAXPICKERING")).toBe("Ajax-Pickering");
  });

  test("still splits CamelCase localities on the lower→upper boundary", () => {
    expect(formatNumberLocality("MarkhamRichmondHill")).toBe("Markham Richmond Hill");
  });

  test("leaves plain and already-punctuated localities untouched", () => {
    expect(formatNumberLocality("Toronto")).toBe("Toronto");
    expect(formatNumberLocality("Saint Catharines Thorold")).toBe("Saint Catharines Thorold");
    expect(formatNumberLocality("Ajax-Pickering")).toBe("Ajax-Pickering");
  });

  test("formatNumberLocation joins locality and region, dropping blanks", () => {
    expect(formatNumberLocation("Ajaxpickering", "ON")).toBe("Ajax-Pickering, ON");
    expect(formatNumberLocation(undefined, "ON")).toBe("ON");
    expect(formatNumberLocation("Toronto", null)).toBe("Toronto");
    expect(formatNumberLocation(null, undefined)).toBe("");
  });
});
