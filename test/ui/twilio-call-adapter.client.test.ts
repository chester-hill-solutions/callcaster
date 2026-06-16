import { describe, expect, test, vi } from "vitest";
import {
  getCallFrom,
  getCallSid,
  logTwilioAdapterResult,
  replaceCallInputStream,
  sendCallDigits,
  setCallMuted,
} from "@/lib/twilio/twilio-call-adapter.client";
import { logger } from "@/lib/logger.client";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function makeCall(overrides: {
  parameters?: Record<string, string>;
  mute?: (muted: boolean) => void;
  setInputStream?: (stream: MediaStream) => Promise<void>;
  sendDigits?: (key: string) => void;
} = {}) {
  return {
    parameters: overrides.parameters,
    mute: overrides.mute,
    _setInputTracksFromStream: overrides.setInputStream,
    sendDigits: overrides.sendDigits ?? vi.fn(),
  } as unknown as import("@twilio/voice-sdk").Call;
}

describe("twilio-call-adapter", () => {
  test("getCallSid and getCallFrom read parameters safely", () => {
    expect(getCallSid(null)).toBeUndefined();
    expect(getCallFrom(null)).toBe("Unknown");

    const call = makeCall({ parameters: { CallSid: "CA123", From: "+15551234567" } });
    expect(getCallSid(call)).toBe("CA123");
    expect(getCallFrom(call)).toBe("+15551234567");
  });

  test("setCallMuted returns explicit adapter results", () => {
    expect(setCallMuted(null, true)).toEqual({ status: "invalid_call" });

    const mute = vi.fn();
    expect(setCallMuted(makeCall({ mute }), true)).toEqual({ status: "ok" });
    expect(mute).toHaveBeenCalledWith(true);

    expect(setCallMuted(makeCall(), true)).toEqual({ status: "unsupported" });
    expect(mute).toHaveBeenCalledTimes(1);
  });

  test("replaceCallInputStream returns explicit adapter results", async () => {
    const setInputStream = vi.fn().mockResolvedValue(undefined);
    const stream = {} as MediaStream;

    expect(await replaceCallInputStream(null, stream)).toEqual({
      status: "invalid_call",
    });

    expect(
      await replaceCallInputStream(makeCall({ setInputStream }), stream),
    ).toEqual({ status: "ok" });
    expect(setInputStream).toHaveBeenCalledWith(stream);

    expect(await replaceCallInputStream(makeCall(), stream)).toEqual({
      status: "unsupported",
    });
    expect(setInputStream).toHaveBeenCalledTimes(1);
  });

  test("sendCallDigits returns explicit adapter results", () => {
    const sendDigits = vi.fn();
    const call = makeCall({ sendDigits });

    expect(sendCallDigits(null, "1")).toEqual({ status: "invalid_call" });
    expect(sendCallDigits(call, "5")).toEqual({ status: "ok" });
    expect(sendDigits).toHaveBeenCalledWith("5");
  });

  test("logTwilioAdapterResult logs unsupported and error results", () => {
    logTwilioAdapterResult({ status: "ok" }, "ctx");
    logTwilioAdapterResult({ status: "invalid_call" }, "ctx");
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();

    logTwilioAdapterResult({ status: "unsupported" }, "mute");
    expect(logger.debug).toHaveBeenCalledWith("Twilio adapter unsupported: mute");

    const err = new Error("boom");
    logTwilioAdapterResult({ status: "error", error: err }, "stream");
    expect(logger.error).toHaveBeenCalledWith("Twilio adapter error: stream", err);
  });
});
