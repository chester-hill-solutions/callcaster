import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse.js";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import {
  appendLiveTranscriptionStreamTwiml,
  type LiveTranscriptionStreamParams,
} from "@/lib/media-stream-twiml.server";

const params: LiveTranscriptionStreamParams = {
  workspaceId: "ws-1",
  userId: "user-1",
  direction: "outbound",
  callId: 42,
  campaignId: "camp-1",
  callSid: "CA123",
};

function appendWith(
  featureFlags: Record<string, unknown> | null | undefined,
  overrides: Partial<LiveTranscriptionStreamParams> = {},
) {
  const voice = new VoiceResponse();
  const attached = appendLiveTranscriptionStreamTwiml({
    twiml: voice,
    featureFlags,
    params: { ...params, ...overrides },
  });
  return { attached, xml: voice.toString() };
}

describe("appendLiveTranscriptionStreamTwiml — flag matrix", () => {
  beforeEach(() => {
    process.env.MEDIA_STREAM_HOST = "stream.example.com";
  });

  test("neither flag: no <Stream>", () => {
    const { attached, xml } = appendWith({});
    expect(attached).toBe(false);
    expect(xml).not.toContain("<Stream");
  });

  test("transcription only: attaches <Stream>", () => {
    const { attached, xml } = appendWith({ liveTranscription: true });
    expect(attached).toBe(true);
    expect(xml).toContain("<Stream");
    expect(xml).toContain("both_tracks");
  });

  // Regression: coaching-only workspaces previously got no <Stream> at all,
  // so the coaching engine never received STT input.
  test("coaching only: still attaches <Stream> (coaching needs STT input)", () => {
    const { attached, xml } = appendWith({ liveCoaching: true });
    expect(attached).toBe(true);
    expect(xml).toContain("<Stream");
  });

  test("both flags: attaches <Stream>", () => {
    const { attached, xml } = appendWith({
      liveTranscription: true,
      liveCoaching: true,
    });
    expect(attached).toBe(true);
    expect(xml).toContain("<Stream");
  });

  test("passes call context as stream parameters", () => {
    const { xml } = appendWith({ liveTranscription: true });
    expect(xml).toContain('name="workspaceId"');
    expect(xml).toContain('value="ws-1"');
    expect(xml).toContain('name="callSid"');
    expect(xml).toContain('value="CA123"');
  });

  test("no <Stream> without workspaceId / userId", () => {
    expect(appendWith({ liveCoaching: true }, { workspaceId: "" }).attached).toBe(false);
    expect(appendWith({ liveCoaching: true }, { userId: "" }).attached).toBe(false);
  });
});

describe("appendLiveTranscriptionStreamTwiml — missing MEDIA_STREAM_HOST", () => {
  beforeEach(() => {
    vi.spyOn(env, "MEDIA_STREAM_HOST").mockReturnValue(undefined as unknown as string);
  });

  test.each([
    ["transcription only", { liveTranscription: true }],
    ["coaching only", { liveCoaching: true }],
    ["both", { liveTranscription: true, liveCoaching: true }],
  ])("fails closed and logs loudly (%s)", (_name, flags) => {
    const voice = new VoiceResponse();
    voice.say("hello");

    // Never throws out of TwiML generation.
    const attached = appendLiveTranscriptionStreamTwiml({
      twiml: voice,
      featureFlags: flags,
      params,
    });

    // Fails closed: no stream attached...
    expect(attached).toBe(false);
    expect(voice.toString()).not.toContain("<Stream");
    // ...but the call itself proceeds normally.
    expect(voice.toString()).toContain("hello");

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("MEDIA_STREAM_HOST"),
      expect.objectContaining({
        guard: "media-stream-host-missing",
        workspaceId: "ws-1",
      }),
    );
  });

  test("stays silent when live media is disabled entirely", () => {
    const { attached } = appendWith({});
    expect(attached).toBe(false);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

/**
 * The `localhost:3001` default used to apply in every environment, which made
 * the fail-closed guard above unreachable in production: prod with the var
 * unset handed Twilio a `wss://localhost:3001` URL it could never reach, so
 * every call carried a silently broken `<Stream>` instead of a loud error.
 * The default is now dev-only.
 */
describe("env.MEDIA_STREAM_HOST — dev-only localhost default", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test("production + unset: resolves to undefined (guard can fire)", () => {
    delete process.env.MEDIA_STREAM_HOST;
    process.env.NODE_ENV = "production";
    expect(env.MEDIA_STREAM_HOST()).toBeUndefined();
  });

  test("production + set: uses the configured host", () => {
    process.env.MEDIA_STREAM_HOST = "stream.example.com";
    process.env.NODE_ENV = "production";
    expect(env.MEDIA_STREAM_HOST()).toBe("stream.example.com");
  });

  test("non-production + unset: keeps the localhost dev default", () => {
    delete process.env.MEDIA_STREAM_HOST;
    process.env.NODE_ENV = "development";
    expect(env.MEDIA_STREAM_HOST()).toBe("localhost:3001");
  });

  test("non-production + set: still prefers the configured host", () => {
    process.env.MEDIA_STREAM_HOST = "tunnel.example.com";
    process.env.NODE_ENV = "development";
    expect(env.MEDIA_STREAM_HOST()).toBe("tunnel.example.com");
  });
});

describe("appendLiveTranscriptionStreamTwiml — production with MEDIA_STREAM_HOST unset", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // No env mocking here: this exercises the real accessor, which is the
    // whole point — the guard was previously unreachable via real config.
    delete process.env.MEDIA_STREAM_HOST;
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test("attaches no <Stream>, logs the guard, and still emits the rest of the TwiML", () => {
    const voice = new VoiceResponse();
    voice.say("connecting you now");
    const dial = voice.dial();
    dial.client("agent-1");

    const attached = appendLiveTranscriptionStreamTwiml({
      twiml: voice,
      featureFlags: { liveCoaching: true, liveTranscription: true },
      params,
    });

    const xml = voice.toString();

    // Fails closed rather than emitting wss://localhost:3001.
    expect(attached).toBe(false);
    expect(xml).not.toContain("<Stream");
    expect(xml).not.toContain("localhost:3001");

    // The call itself is unaffected.
    expect(xml).toContain("connecting you now");
    expect(xml).toContain("<Dial");
    expect(xml).toContain("<Client>agent-1</Client>");

    // And the misconfiguration is loud.
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("MEDIA_STREAM_HOST"),
      expect.objectContaining({
        guard: "media-stream-host-missing",
        workspaceId: "ws-1",
        direction: "outbound",
      }),
    );
  });

  test("non-production with the var unset still streams to the localhost default", () => {
    process.env.NODE_ENV = "development";

    const voice = new VoiceResponse();
    const attached = appendLiveTranscriptionStreamTwiml({
      twiml: voice,
      featureFlags: { liveTranscription: true },
      params,
    });

    expect(attached).toBe(true);
    expect(voice.toString()).toContain("ws://localhost:3001/");
    expect(logger.error).not.toHaveBeenCalled();
  });
});
