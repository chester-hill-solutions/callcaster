import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireTwilioSignature: vi.fn() }));

vi.mock("@/lib/twilio-webhook.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-webhook.server")>()),
  requireTwilioSignature: (...args: unknown[]) => mocks.requireTwilioSignature(...args),
}));

function makeRequest(fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new Request("https://example.test/ivr-response", { method: "POST", body });
}

describe("requireTwilioSignatureForIvrResponse", () => {
  beforeEach(() => {
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockResolvedValue(null);
  });

  test("captures speech text and a valid Twilio confidence score", async () => {
    const { requireTwilioSignatureForIvrResponse } = await import(
      "@/lib/ivr-webhook-auth.server"
    );
    const request = makeRequest({
      CallSid: "CA1",
      SpeechResult: "  yes, please  ",
      Confidence: "0.87",
    });

    await expect(
      requireTwilioSignatureForIvrResponse(request, ["campaign", "page", "block"]),
    ).resolves.toEqual({
      callSid: "CA1",
      userInput: "  yes, please  ",
      answer: {
        value: "yes, please",
        raw: "  yes, please  ",
        confidence: 0.87,
        inputType: "speech",
      },
    });
    expect(mocks.requireTwilioSignature).toHaveBeenCalledWith(request, {
      callSid: "CA1",
    });
  });

  test.each([undefined, "", "unknown", "-0.1", "1.1", "Infinity"])(
    "keeps confidence null when Twilio sends an invalid or missing value (%s)",
    async (confidence) => {
      const { requireTwilioSignatureForIvrResponse } = await import(
        "@/lib/ivr-webhook-auth.server"
      );
      const fields: Record<string, string> = { CallSid: "CA1", SpeechResult: "support" };
      if (confidence !== undefined) fields.Confidence = confidence;

      const result = await requireTwilioSignatureForIvrResponse(
        makeRequest(fields),
        ["campaign", "page", "block"],
      );

      expect(result).toMatchObject({
        userInput: "support",
        answer: {
          value: "support",
          raw: "support",
          confidence: null,
          inputType: "speech",
        },
      });
    },
  );

  test("records DTMF as structured input without speech confidence", async () => {
    const { requireTwilioSignatureForIvrResponse } = await import(
      "@/lib/ivr-webhook-auth.server"
    );
    const result = await requireTwilioSignatureForIvrResponse(
      makeRequest({ CallSid: "CA1", Digits: "2", Confidence: "0.99" }),
      ["campaign", "page", "block"],
    );

    expect(result).toMatchObject({
      userInput: "2",
      answer: { value: "2", raw: "2", confidence: null, inputType: "dtmf" },
    });
  });

  test("does not create an answer when Gather has no input", async () => {
    const { requireTwilioSignatureForIvrResponse } = await import(
      "@/lib/ivr-webhook-auth.server"
    );
    const result = await requireTwilioSignatureForIvrResponse(
      makeRequest({ CallSid: "CA1" }),
      ["campaign", "page", "block"],
    );

    expect(result).toMatchObject({ userInput: null, answer: null });
  });
});
