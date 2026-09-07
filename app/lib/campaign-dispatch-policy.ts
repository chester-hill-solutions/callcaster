import type { Schedule, ScheduleDay } from "@/lib/types";
import { normalizeSchedule } from "@/lib/workspace-members";
import { isWithinSendWindow, nextSendWindowOpenAt, parseSendWindow } from "@/lib/campaign-send-window";
import {
  consumeScheduleTime,
  nextScheduleOpenMs,
  scheduleHasActiveTime,
  scheduleIntervalAt,
} from "@/lib/schedule-intervals";

/**
 * Explicit dispatch policies over the shared interval engine (roadmap E2.2).
 *
 * The engine (`schedule-intervals`) only knows weekly intervals. The two
 * outbound products layer different business rules on it, and those rules
 * used to live in three places each (dispatch gate, next-open, ETA):
 *
 * - SMS: `campaign.sms_send_window`. Absent or empty means send any time.
 * - IVR / calling: `campaign.schedule` calling hours plus `start_date` /
 *   `end_date`. Absent schedule means never; an interval whose start equals
 *   its end is inactive (legacy `checkSchedule` semantics, kept on purpose).
 *
 * Every consumer asks the policy, so ETA and dispatch can never disagree.
 */
export type DispatchPolicy = {
  kind: "sms" | "ivr";
  /** Parsed weekly schedule, or null when this policy has no weekly restriction. */
  schedule: Schedule | null;
  /** Inclusive lower bound in ms since epoch, or null. */
  notBeforeMs: number | null;
  /** Inclusive upper bound in ms since epoch, or null. */
  notAfterMs: number | null;
  /** What a missing schedule means: SMS sends any time, IVR never dials. */
  allowedWithoutSchedule: boolean;
};

export type SmsPolicySource = { sms_send_window?: unknown };
export type IvrPolicySource = {
  schedule?: unknown;
  start_date?: string | null;
  end_date?: string | null;
};

export function smsSendPolicy(campaign: SmsPolicySource | null | undefined): DispatchPolicy {
  return {
    kind: "sms",
    schedule: campaign?.sms_send_window ? parseSendWindow(campaign.sms_send_window) : null,
    notBeforeMs: null,
    notAfterMs: null,
    allowedWithoutSchedule: true,
  };
}

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Calling-hours schedule with zero-length intervals removed (they never allow dialing). */
function parseCallingHours(raw: unknown): Schedule | null {
  const normalized = normalizeSchedule(raw);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return null;
  const out: Record<string, ScheduleDay> = {};
  for (const [day, value] of Object.entries(normalized as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const dayValue = value as Partial<ScheduleDay>;
    if (!dayValue.active || !Array.isArray(dayValue.intervals)) continue;
    const intervals = dayValue.intervals.filter(
      (interval) =>
        interval &&
        typeof interval.start === "string" &&
        typeof interval.end === "string" &&
        interval.start !== interval.end,
    );
    out[day] = { active: true, intervals };
  }
  const schedule = out as unknown as Schedule;
  return scheduleHasActiveTime(schedule) ? schedule : null;
}

export function ivrCallingPolicy(campaign: IvrPolicySource | null | undefined): DispatchPolicy {
  return {
    kind: "ivr",
    schedule: parseCallingHours(campaign?.schedule),
    notBeforeMs: parseDateMs(campaign?.start_date),
    notAfterMs: parseDateMs(campaign?.end_date),
    allowedWithoutSchedule: false,
  };
}

function withinDateBounds(policy: DispatchPolicy, atMs: number): boolean {
  if (policy.notBeforeMs !== null && atMs < policy.notBeforeMs) return false;
  if (policy.notAfterMs !== null && atMs > policy.notAfterMs) return false;
  return true;
}

/** Whether dispatch is allowed at `at` under the policy. */
export function isDispatchAllowedAt(policy: DispatchPolicy, at: Date = new Date()): boolean {
  const atMs = at.getTime();
  if (!withinDateBounds(policy, atMs)) return false;
  // SMS keeps its named send-window entry points (they sit on the same engine).
  if (policy.kind === "sms") return isWithinSendWindow(policy.schedule, at);
  if (!policy.schedule) return policy.allowedWithoutSchedule;
  return scheduleIntervalAt(policy.schedule, atMs) !== null;
}

/** A week plus today's tail covers any weekly schedule. */
const NEXT_OPEN_LOOKAHEAD_DAYS = 8;

/**
 * The next instant dispatch is allowed: `at` when already allowed, the next
 * interval start (or the start date, whichever is later) otherwise, and
 * `null` when there is nothing to wait for or nothing will ever open.
 */
export function nextDispatchOpenAt(policy: DispatchPolicy, at: Date = new Date()): Date | null {
  // SMS: the named send-window entry point already answers null for
  // unrestricted and `at` for "already inside".
  if (policy.kind === "sms") return nextSendWindowOpenAt(policy.schedule, at);
  if (isDispatchAllowedAt(policy, at)) return new Date(at);
  if (!policy.schedule) return null;
  const fromMs = Math.max(at.getTime(), policy.notBeforeMs ?? at.getTime());
  const openMs = scheduleIntervalAt(policy.schedule, fromMs)
    ? fromMs
    : nextScheduleOpenMs(policy.schedule, fromMs, NEXT_OPEN_LOOKAHEAD_DAYS);
  if (openMs === null) return null;
  if (policy.notAfterMs !== null && openMs > policy.notAfterMs) return null;
  return new Date(openMs);
}

/** Bounded lookahead for ETA projection: about a year of schedule. */
const ETA_LOOKAHEAD_DAYS = 366;

export type DispatchTimeProjection =
  | { kind: "finish"; finishMs: number }
  | { kind: "beyond_end_date"; notAfterMs: number }
  | { kind: "no_active_time" };

/**
 * When `neededSeconds` of allowed dispatch time, starting at `from`, will be
 * used up. Time before the start date is skipped; an unrestricted policy runs
 * continuously; a finish past the end date reports that instead of a time.
 */
export function projectDispatchTime(
  policy: DispatchPolicy,
  from: Date,
  neededSeconds: number,
): DispatchTimeProjection {
  const startMs = Math.max(from.getTime(), policy.notBeforeMs ?? from.getTime());
  let finishMs: number | null;
  if (!policy.schedule) {
    finishMs = policy.allowedWithoutSchedule ? startMs + neededSeconds * 1000 : null;
  } else {
    finishMs = consumeScheduleTime(policy.schedule, startMs, neededSeconds, ETA_LOOKAHEAD_DAYS);
  }
  if (finishMs === null) return { kind: "no_active_time" };
  if (policy.notAfterMs !== null && finishMs > policy.notAfterMs) {
    return { kind: "beyond_end_date", notAfterMs: policy.notAfterMs };
  }
  return { kind: "finish", finishMs };
}
