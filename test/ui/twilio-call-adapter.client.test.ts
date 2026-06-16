import { describe, expect, test, vi } from "vitest";
import {
  getCallFrom,
  getCallSid,
  replaceCallInputStream,
  sendCallDigits,
  setCallMuted,
} from "@/lib/twilio/twilio-call-adapter.client";

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

  test("setCallMuted only invokes mute when supported", () => {
    const mute = vi.fn();
    setCallMuted(makeCall({ mute }), true);
    expect(mute).toHaveBeenCalledWith(true);

    setCallMuted(makeCall(), true);
    expect(mute).toHaveBeenCalledTimes(1);
  });

  test("replaceCallInputStream only invokes SDK hook when supported", async () => {
    const setInputStream = vi.fn().mockResolvedValue(undefined);
    const stream = {} as MediaStream;

    await replaceCallInputStream(makeCall({ setInputStream }), stream);
    expect(setInputStream).toHaveBeenCalledWith(stream);

    await replaceCallInputStream(makeCall(), stream);
    expect(setInputStream).toHaveBeenCalledTimes(1);
  });

  test("sendCallDigits delegates to call.sendDigits", () => {
    const sendDigits = vi.fn();
    const call = makeCall({ sendDigits });
    sendCallDigits(call, "5");
    expect(sendDigits).toHaveBeenCalledWith("5");
    sendCallDigits(null, "1");
    expect(sendDigits).toHaveBeenCalledTimes(1);
  });
});
