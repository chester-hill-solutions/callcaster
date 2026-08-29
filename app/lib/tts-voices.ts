/**
 * Curated Text-to-Speech voice roster for IVR synthetic-speech blocks
 * (#1401 runtime slice).
 *
 * Every `twiml.say(text)` call in the IVR runtime passed no voice option,
 * so Twilio silently used the account default (Amazon Polly Salli, a US-English
 * female voice — the same for every workspace with no way to configure it).
 *
 * This module ships a small curated list of Amazon Polly Neural voices —
 * they're supported by Twilio's `<Say>` verb out of the box for
 * every workspace and don't require any billing changes beyond Twilio's
 * standard Polly Neural pricing. The IDs are the exact strings Twilio
 * expects in the `voice` attribute on `<Say>`.
 *
 * Design notes:
 *   - Small, curated list on purpose. Twilio exposes ~60 Polly voices
 *     per language; presenting all of them at editor time is a UX
 *     nightmare and most sound similar. Five per locale is enough for
 *     "male/female × warm/neutral × en-US/en-CA".
 *   - Extension shape: `voice` is stored on the block via `wireExtras.voice`
 *     to avoid a scriptkit schema bump. `wireExtras` is scriptkit's
 *     documented pass-through slot; it survives migrate → serialize
 *     round-trips.
 *   - `DEFAULT_VOICE_ID` matches the current Twilio account default so
 *     workspaces that never set a voice keep hearing the same one.
 */

export type TtsVoice = {
  /** Twilio `<Say voice="...">` value. Polly Neural voice IDs prefix with `Polly.` and end with `-Neural`. */
  id: string;
  /** Short human-facing name for the roster UI. */
  label: string;
  /** BCP-47 locale tag for grouping in the selector. */
  locale: string;
  /** Gender for grouping only — not used at runtime. */
  gender: "female" | "male";
};

/** Roster of voices the IVR editor's synthetic-speech selector can pick from. */
export const TTS_VOICES: readonly TtsVoice[] = [
  { id: "Polly.Salli-Neural", label: "Salli — US English (warm)", locale: "en-US", gender: "female" },
  { id: "Polly.Joanna-Neural", label: "Joanna — US English (neutral)", locale: "en-US", gender: "female" },
  { id: "Polly.Matthew-Neural", label: "Matthew — US English (baritone)", locale: "en-US", gender: "male" },
  { id: "Polly.Kimberly-Neural", label: "Kimberly — US English (bright)", locale: "en-US", gender: "female" },
  // Canadian-English pair — matches CallCaster's home market so operating-country
  // CA workspaces get a locally-accented default without any config.
  { id: "Polly.Emma-Neural", label: "Emma — Canadian English", locale: "en-CA", gender: "female" },
] as const;

/**
 * Fallback when a synthetic block has no `voice` set. Matches the historical
 * Twilio-account default (Salli) so workspaces that never touched voice
 * keep hearing the same one after this change lands.
 */
export const DEFAULT_VOICE_ID = "Polly.Salli-Neural" as const;

/** Membership check used to reject an unknown voice id from a wire block. */
export function isKnownVoiceId(id: string | null | undefined): id is TtsVoice["id"] {
  if (!id) return false;
  return TTS_VOICES.some((voice) => voice.id === id);
}

/**
 * Resolve a `<Say voice="...">` id for one block. Reads the optional
 * `wireExtras.voice` slot the editor writes (unmodelled by the scriptkit
 * schema — see wireExtras docstring in scriptkit types). Falls back to the
 * account default when the block hasn't opted into a voice, or when the
 * stored value isn't in the curated roster (the roster IS the allowlist —
 * a rogue wire value would 500 the `<Say>` at Twilio otherwise).
 */
export function resolveVoiceForBlock(block: {
  wireExtras?: Record<string, unknown> | null | undefined;
}): TtsVoice["id"] {
  const rawVoice = block.wireExtras && typeof block.wireExtras === "object"
    ? (block.wireExtras as Record<string, unknown>).voice
    : undefined;
  if (typeof rawVoice === "string" && isKnownVoiceId(rawVoice)) {
    return rawVoice;
  }
  return DEFAULT_VOICE_ID;
}
