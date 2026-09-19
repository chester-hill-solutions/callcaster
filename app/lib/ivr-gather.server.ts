/**
 * Shared `<Gather>` attributes for IVR option steps (#1875).
 *
 * Both the outbound campaign route and the inbound IVR route build the same
 * gather; keeping the attribute decisions here means speech capture improves in
 * one place.
 */

export type IvrGatherOption = {
  value?: string | number | null;
  label?: string | null;
  content?: string | null;
};

export type IvrGatherAttributes = {
  input: Array<"dtmf" | "speech">;
  timeout: number;
  speechTimeout?: string;
  speechModel?: "phone_call";
  hints?: string;
  numDigits?: number;
};

/** How long to wait for input after the prompt, in seconds. */
const GATHER_TIMEOUT_SECONDS = 5;

/**
 * Seconds of silence to allow before ending speech recognition, as a string
 * because Twilio's `speechTimeout` is text ("auto" or a positive integer).
 * Twilio documents `"auto"` as invalid whenever `speechModel` is set, so the
 * two move together.
 */
const SPEECH_TIMEOUT_SECONDS = "3";

/** Twilio accepts up to 500 hint entries; each entry up to 100 characters. */
const MAX_HINT_ENTRIES = 500;
const MAX_HINT_LENGTH = 100;

/** `LawnSignRequest` → `Lawn Sign Request`, then collapsed whitespace. */
function humanizeHint(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A step maps a spoken answer when it offers a `vx-any` option — the runtime's
 * "any spoken reply" catch-all. Keypad-only menus must not gather speech, or a
 * stray phrase skips the menu (#1856).
 */
export function ivrStepGathersSpeech(
  options: ReadonlyArray<IvrGatherOption>,
): boolean {
  return options.some((option) => String(option.value).trim() === "vx-any");
}

/**
 * Expected words and phrases for Twilio's speech recogniser, taken from the
 * step's own answer labels (the editor shows these in results). Improves
 * recognition of the answers this step is actually waiting for.
 */
export function ivrSpeechHints(
  options: ReadonlyArray<IvrGatherOption>,
): string | undefined {
  const seen = new Set<string>();
  const hints: string[] = [];
  for (const option of options) {
    for (const candidate of [option.label, option.content]) {
      if (typeof candidate !== "string") continue;
      const hint = humanizeHint(candidate);
      if (!hint) continue;
      const key = hint.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hints.push(hint.slice(0, MAX_HINT_LENGTH));
      if (hints.length >= MAX_HINT_ENTRIES) {
        return hints.join(", ");
      }
    }
  }
  return hints.length > 0 ? hints.join(", ") : undefined;
}

/**
 * `numDigits` for a single-key menu: every option is one keypad character and
 * none is the spoken catch-all, so the gather can submit on the first press
 * instead of waiting out the timeout.
 */
export function ivrSingleKeyDigits(
  options: ReadonlyArray<IvrGatherOption>,
): number | undefined {
  if (options.length === 0) return undefined;
  const everyOptionIsOneKey = options.every((option) => {
    const value = String(option.value ?? "").trim();
    return value.length === 1 && /^[0-9*#]$/.test(value);
  });
  return everyOptionIsOneKey ? 1 : undefined;
}

/** Build the gather attributes for one option step. */
export function ivrGatherAttributes(
  options: ReadonlyArray<IvrGatherOption>,
): IvrGatherAttributes {
  const gathersSpeech = ivrStepGathersSpeech(options);

  if (gathersSpeech) {
    return {
      input: ["dtmf", "speech"],
      speechTimeout: SPEECH_TIMEOUT_SECONDS,
      speechModel: "phone_call",
      hints: ivrSpeechHints(options),
      timeout: GATHER_TIMEOUT_SECONDS,
    };
  }

  return {
    input: ["dtmf"],
    numDigits: ivrSingleKeyDigits(options),
    timeout: GATHER_TIMEOUT_SECONDS,
  };
}
