import { describe, expect, test } from "vitest";
import {
  isRetryableTwilioError,
  presentTwilioError,
  twilioErrorUserMessage,
} from "@/lib/twilio-errors";

describe("twilio-errors", () => {
  test("marks 429 as retryable", () => {
    expect(isRetryableTwilioError({ status: 429, message: "Too Many Requests" })).toBe(true);
  });

  test("marks 400 as non-retryable", () => {
    expect(isRetryableTwilioError({ status: 400, message: "Bad Request" })).toBe(false);
  });

  test("maps credit errors to user-friendly copy", () => {
    const presented = presentTwilioError({ code: 20003, message: "Insufficient credits" });
    expect(presented.userMessage).toContain("credits");
    expect(presented.retryable).toBe(false);
  });

  test("twilioErrorUserMessage returns user-safe string", () => {
    expect(twilioErrorUserMessage(new Error("Error 21422: not available"))).toContain(
      "no longer available",
    );
  });
});
