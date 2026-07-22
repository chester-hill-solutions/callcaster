/**
 * Recipient-local calling-window enforcement.
 *
 * TCPA (US) and CRTC (Canada) telemarketing rules define permitted calling
 * hours in the RECIPIENT'S local time — 8:00am to 9:00pm. Campaign-level
 * calling hours (campaign.schedule, evaluated in UTC by checkSchedule) express
 * the sender's preference; this module is the legal floor layered on top,
 * derived from the contact's area code via {@link NANP_AREA_CODE_TIMEZONES}.
 *
 * Unknown numbers (toll-free, unmapped overlays, non-NANP) degrade SAFE: they
 * are only callable while the window holds simultaneously in the east-most
 * and west-most NANP zones, i.e. roughly 11:30am–9:00pm Newfoundland /
 * 8:00am–5:30pm Hawaii.
 */
import { NANP_AREA_CODE_TIMEZONES } from "./nanp-timezones";

/** Legal floor: no outbound campaign traffic before 8:00am recipient time. */
export const RECIPIENT_WINDOW_START_MINUTES = 8 * 60;
/** Legal floor: no outbound campaign traffic at/after 9:00pm recipient time. */
export const RECIPIENT_WINDOW_END_MINUTES = 21 * 60;

/** Bounds used when the recipient's zone is unknown. */
const EASTMOST_NANP_ZONE = "America/St_Johns";
const WESTMOST_NANP_ZONE = "Pacific/Honolulu";

/** 3-digit NANP area code for a phone number, or null when not NANP-shaped. */
export function areaCodeForPhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/[^0-9]/g, "");
  const national =
    digits.length === 11 && digits.startsWith("1")
      ? digits.slice(1)
      : digits.length === 10
        ? digits
        : null;
  return national ? national.slice(0, 3) : null;
}

/** IANA timezone inferred from the phone's area code, or null when unknown. */
export function recipientTimezoneForPhone(
  phone: string | null | undefined,
): string | null {
  const areaCode = areaCodeForPhone(phone);
  if (!areaCode) return null;
  return NANP_AREA_CODE_TIMEZONES[areaCode] ?? null;
}

/** Minutes since local midnight in `timeZone`, or null if the zone is invalid. */
export function minutesOfDayInZone(timeZone: string, now: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

function windowHoldsInZone(timeZone: string, now: Date): boolean {
  const minutes = minutesOfDayInZone(timeZone, now);
  if (minutes == null) return false;
  return (
    minutes >= RECIPIENT_WINDOW_START_MINUTES &&
    minutes < RECIPIENT_WINDOW_END_MINUTES
  );
}

export type RecipientWindowStatus = {
  allowed: boolean;
  /** Inferred zone, or null when the number's zone is unknown. */
  timezone: string | null;
  /**
   * - `in_window`: recipient-local time is within 8:00–21:00
   * - `outside_window`: recipient-local time is outside the window
   * - `unknown_timezone_safe`: zone unknown, but the window holds across all
   *   NANP zones simultaneously
   * - `unknown_timezone_blocked`: zone unknown and some NANP zone is outside
   *   the window — blocked to stay conservative
   */
  reason:
    | "in_window"
    | "outside_window"
    | "unknown_timezone_safe"
    | "unknown_timezone_blocked";
};

/** Full verdict, for logging and UI ("skipped: 9:14pm in America/Denver"). */
export function recipientCallingWindowStatus(
  phone: string | null | undefined,
  now: Date = new Date(),
): RecipientWindowStatus {
  // The E2E/preview harness (same switch that relaxes prod-only boot guards)
  // runs at arbitrary UTC times with fictional 555 fixtures — enforcing the
  // wall-clock window there would make specs pass or fail by time of day.
  // Real deployments never set E2E_TEST.
  if (process.env.E2E_TEST === "1") {
    return { allowed: true, timezone: null, reason: "in_window" };
  }
  const timezone = recipientTimezoneForPhone(phone);
  if (timezone) {
    const allowed = windowHoldsInZone(timezone, now);
    return {
      allowed,
      timezone,
      reason: allowed ? "in_window" : "outside_window",
    };
  }
  const allowed =
    windowHoldsInZone(EASTMOST_NANP_ZONE, now) &&
    windowHoldsInZone(WESTMOST_NANP_ZONE, now);
  return {
    allowed,
    timezone: null,
    reason: allowed ? "unknown_timezone_safe" : "unknown_timezone_blocked",
  };
}

/** Whether an outbound campaign call/text to `phone` is permitted right now. */
export function isWithinRecipientCallingWindow(
  phone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return recipientCallingWindowStatus(phone, now).allowed;
}
