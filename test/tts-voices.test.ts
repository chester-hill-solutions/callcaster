import { describe, expect, test } from "vitest";

import {
  DEFAULT_VOICE_ID,
  isKnownVoiceId,
  resolveVoiceForBlock,
  TTS_VOICES,
} from "@/lib/tts-voices";

describe("tts-voices (#1401 runtime slice)", () => {
  test("every roster entry is a Polly Neural id (Twilio's <Say> supports these out of the box)", () => {
    // If someone adds a Google or Amazon-Standard id, twiml.say will still
    // work at runtime but the labels below are Polly-shaped and the pricing
    // profile changes silently. Keep the roster homogeneous until we
    // deliberately widen it.
    for (const voice of TTS_VOICES) {
      expect(voice.id.startsWith("Polly.")).toBe(true);
      expect(voice.id.endsWith("-Neural")).toBe(true);
      expect(voice.label.length).toBeGreaterThan(0);
      expect(voice.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(voice.gender === "female" || voice.gender === "male").toBe(true);
    }
  });

  test("DEFAULT_VOICE_ID matches an entry in the roster (roster IS the allowlist)", () => {
    expect(TTS_VOICES.some((v) => v.id === DEFAULT_VOICE_ID)).toBe(true);
  });

  test("isKnownVoiceId accepts every roster id and rejects unknowns / falsy", () => {
    for (const voice of TTS_VOICES) {
      expect(isKnownVoiceId(voice.id)).toBe(true);
    }
    // Not a Polly ID.
    expect(isKnownVoiceId("Polly.Ruth-Neural")).toBe(false);
    // Not in the curated set even though the shape is plausible.
    expect(isKnownVoiceId("Polly.Made-Up-Neural")).toBe(false);
    // Falsy inputs.
    expect(isKnownVoiceId(undefined)).toBe(false);
    expect(isKnownVoiceId(null)).toBe(false);
    expect(isKnownVoiceId("")).toBe(false);
  });

  describe("resolveVoiceForBlock", () => {
    test("returns the block's wireExtras.voice when present and in the roster", () => {
      const known = TTS_VOICES[1]?.id ?? DEFAULT_VOICE_ID;
      expect(
        resolveVoiceForBlock({ wireExtras: { voice: known } }),
      ).toBe(known);
    });

    test("falls back to DEFAULT_VOICE_ID when wireExtras.voice is missing", () => {
      expect(resolveVoiceForBlock({ wireExtras: {} })).toBe(DEFAULT_VOICE_ID);
      expect(resolveVoiceForBlock({ wireExtras: null })).toBe(DEFAULT_VOICE_ID);
      expect(resolveVoiceForBlock({})).toBe(DEFAULT_VOICE_ID);
    });

    test("rejects an unknown voice id and falls back to DEFAULT_VOICE_ID", () => {
      // The roster IS the allowlist — a rogue wire value must never reach
      // twiml.say (Twilio would 500 the response, killing the IVR).
      expect(
        resolveVoiceForBlock({ wireExtras: { voice: "attacker.injection" } }),
      ).toBe(DEFAULT_VOICE_ID);
    });

    test("ignores non-string voice values without throwing", () => {
      expect(
        resolveVoiceForBlock({ wireExtras: { voice: 42 as unknown as string } }),
      ).toBe(DEFAULT_VOICE_ID);
      expect(
        resolveVoiceForBlock({
          wireExtras: { voice: ["a"] as unknown as string },
        }),
      ).toBe(DEFAULT_VOICE_ID);
    });
  });
});
