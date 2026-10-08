/**
 * One option shape, four readers, and only one of them was right.
 *
 * The documented script format ([docs/script-json-format.md](docs/script-json-format.md))
 * defines an option as `content` (the text) plus `next` (where it goes) — there
 * is no `value` field. The editor's own shape has `value` and `label`. So a
 * script can carry options in either shape, and a reader that consults only
 * `value` silently finds nothing in a documented-format script.
 *
 * The failure was quiet because the fall-through is reasonable: a press that
 * matches no option walks the linear chain, which is what a non-interactive
 * block does anyway. So an author's "No → hang up" branch was declared, passed
 * validation, and never ran.
 *
 * Every reader goes through here. The value is the *matchable* form — the digit
 * or `vx-any` — and the label is the text. They are not the same field, and
 * conflating them is what let the two shapes diverge.
 */

export type IvrOptionLike = {
  value?: string | number | null;
  label?: string | null;
  content?: string | null;
  /**
   * Where the option goes. Declared here because the two shapes store it
   * identically: only the *matching* field differs between them.
   */
  next?: string | null;
};

/** The empty value, so callers never see `undefined` from a missing field. */
const NO_VALUE = "";

/**
 * The option's matchable value: `value` when present, else the text.
 *
 * `value` wins when both are set, because that is the editor's explicit
 * key-to-press mapping and it is what a caller pressed. Falling back to the text
 * is what makes a documented-format option matchable at all.
 */
export function ivrOptionValue(option: IvrOptionLike | null | undefined): string {
  if (!option) return NO_VALUE;
  const explicit = String(option.value ?? "").trim();
  if (explicit) return explicit;
  return String(option.content ?? "").trim();
}

/**
 * The option's display text: `label` when present, else the text.
 *
 * Ordered the other way round from `ivrOptionValue` on purpose. A label is what
 * the author wrote *for display*, so it is preferred for showing; and if only
 * one of the two is set, this returns it either way.
 */
export function ivrOptionLabel(option: IvrOptionLike | null | undefined): string {
  if (!option) return NO_VALUE;
  const label = String(option.label ?? "").trim();
  if (label) return label;
  return String(option.content ?? "").trim();
}

/**
 * The option a key press selects, or `undefined` when none matches.
 *
 * `vx-any` is the spoken catch-all: Twilio sends the recognised phrase rather
 * than a key, so it only applies to input longer than a keypress.
 */
export function findIvrMatchedOption<T extends IvrOptionLike>(
  options: ReadonlyArray<T> | null | undefined,
  userInput: string | null | undefined,
): T | undefined {
  if (!options || options.length === 0) return undefined;
  if (userInput == null) return undefined;
  const input = userInput.trim();
  if (!input) return undefined;

  return options.find((option) => {
    const value = ivrOptionValue(option);
    return value === input || (input.length > 2 && value === "vx-any");
  });
}

/**
 * The display label for a recorded answer, or the answer itself when no option
 * matches. Results and the CSV export use this, so a documented-format option
 * shows its text rather than the raw digit.
 */
export function resolveIvrOptionLabel<T extends IvrOptionLike>(
  options: ReadonlyArray<T> | null | undefined,
  value: string,
): string {
  const matched = findIvrMatchedOption(options, value);
  if (!matched) return value;
  return ivrOptionLabel(matched) || value;
}
