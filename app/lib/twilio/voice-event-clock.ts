import { z } from "zod";

const isoTime = z.iso.datetime({ offset: true });
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Provider event time is never interpreted in the host's local timezone. */
export function parseTwilioVoiceTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const rfc = /^(?:[A-Za-z]{3}, )?(\d{1,2}) ([A-Za-z]{3}) (\d{4}) (\d{2}:\d{2}:\d{2}) (GMT|[+-]\d{4})$/.exec(value);
  const [, day = "", monthName = "", year = "", clock = "", zone = ""] = rfc ?? [];
  const month = months.indexOf(monthName) + 1, offset = zone === "GMT" ? "Z" : zone.replace(/(\d{2})$/, ":$1");
  const normalized = rfc ? `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}T${clock}${offset}` : value;
  const parsed = isoTime.safeParse(normalized);
  return parsed.success ? new Date(parsed.data) : null;
}

/** Sequence domains stay separate even when they use this same integer parser. */
export function parseTwilioVoiceSequence(value: string | undefined) {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence <= 2147483647 ? sequence : null;
}
