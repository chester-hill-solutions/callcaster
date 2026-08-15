import { z } from "zod";

/**
 * Twilio VOICE webhook payloads, parsed ONCE at the route boundary into a
 * discriminated union (#1243 E1).
 *
 * Before this, every voice callback route re-derived its own view of the same
 * form body: `twilioParamsToUnderCase` produced a `Record<string, unknown>`
 * and each read was re-narrowed inline with `typeof x === "string" ? x : ...`
 * — 15 of them in `auto-dial/status` alone. Those narrowings were not
 * validation: they said "this might be a string" over a value that is always a
 * form field, and they hid the questions that actually matter (is this a call
 * status? a conference participant event? a recording?).
 *
 * The rule is: parse at the edge, pass the parsed event inward. Handlers take
 * a narrowed member (`ParticipantJoinEvent`, not `{[x: string]: string}`), and
 * the worker jobs that continue a webhook's work carry the parsed event in
 * their payload instead of re-reading the raw params.
 *
 * NEVER THROWS. A Twilio webhook that 500s is retried for hours, so an
 * unexpected body must not be an error: anything that does not match a known
 * shape comes back as `UnrecognizedCallback`, carrying `raw` so a caller can
 * still log or fall back on the original params.
 *
 * Follows the typed-Twilio-message pattern in `services/media-stream/types.ts`
 * (shape-per-event + a guard), with the schemas as the source of truth so the
 * job-payload validation in `job-registry.server.ts` cannot drift from the
 * types the routes consume.
 */

/** `StatusCallbackEvent` values Twilio sends for conference callbacks. */
export const PARTICIPANT_EVENT_NAMES = [
  "participant-join",
  "participant-leave",
  "participant-modify",
  "participant-speech-start",
  "participant-speech-stop",
  "conference-start",
  "conference-end",
  "announcement-start",
  "announcement-end",
] as const;

const participantEventName = z.enum(PARTICIPANT_EVENT_NAMES);

/**
 * Fields Twilio puts on voice callbacks regardless of shape.
 *
 * `callStatus` is `""` (not null) when absent because every existing caller
 * compared it as a string (`switch (callStatus)`, `.toLowerCase()`), and
 * `durationSeconds` is the `max(Duration, CallDuration)` those callers all
 * computed by hand.
 */
const voiceCallbackCommon = {
  /** The form body exactly as Twilio posted it. */
  raw: z.record(z.string(), z.string()),
  callSid: z.string().nullable(),
  accountSid: z.string().nullable(),
  callStatus: z.string(),
  timestamp: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  /**
   * Answering-machine-detection result. Common (not `call-status`-only)
   * because Twilio's async-AMD callback (`AsyncAmd`) posts `CallSid` +
   * `AnsweredBy` with no `CallStatus` at all — that payload discriminates to
   * `unrecognized`, and `dial/status` still needs to read `AnsweredBy` off it
   * (#1243 E2).
   */
  answeredBy: z.string().nullable(),
};

/** A plain call status callback: `CallSid` + `CallStatus`, no conference, no recording. */
export const callStatusCallbackSchema = z.object({
  ...voiceCallbackCommon,
  kind: z.literal("call-status"),
  callSid: z.string(),
  callStatus: z.string().min(1),
  direction: z.string().nullable(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  parentCallSid: z.string().nullable(),
  sequenceNumber: z.string().nullable(),
});

/**
 * A conference `StatusCallbackEvent`.
 *
 * `conferenceName` and `conferenceSid` are DELIBERATELY separate fields, and
 * this is the whole point of the union for this route. CallCaster mints
 * conference names as `${userId}~${uuid}` and stores that name in
 * `call.conference_id`, while `ConferenceSid` is a `CF…` SID — two different
 * identifiers that the old untyped code kept collapsing into one
 * `friendly_name ?? conference_sid` expression. `dequeue_contact` binds the
 * user argument as `::uuid`, so feeding it a conference NAME raised 22P02 on
 * every terminal call: the contact was never dequeued and the dialer stopped
 * after one call with the campaign stuck on "Running" (#1004).
 *
 * `conferenceUserId` is that name's user-id prefix, parsed here once, so the
 * distinction is a field you have to pick rather than a cast you can forget.
 * `conferenceRef` is the value used to ADDRESS the conference (name preferred,
 * SID as fallback) — what `twilio.conferences.list({friendlyName})` wants and
 * what gets written to `call.conference_id`.
 */
export const participantEventSchema = z.object({
  ...voiceCallbackCommon,
  kind: z.literal("participant"),
  event: participantEventName,
  /** `CF…` conference SID. */
  conferenceSid: z.string().nullable(),
  /** `FriendlyName` — the `${userId}~${uuid}` conference NAME, never a uuid on its own. */
  conferenceName: z.string().nullable(),
  /** `conferenceName ?? conferenceSid` — how the conference is addressed. */
  conferenceRef: z.string().nullable(),
  /** The `userId` prefix of `conferenceName`, or null when the name is not `${userId}~${uuid}`. */
  conferenceUserId: z.string().nullable(),
  participantCallSid: z.string().nullable(),
  reasonParticipantLeft: z.string().nullable(),
});

/** A recording status callback (call or conference recording). */
export const recordingEventSchema = z.object({
  ...voiceCallbackCommon,
  kind: z.literal("recording"),
  recordingSid: z.string().nullable(),
  recordingUrl: z.string().nullable(),
  recordingStatus: z.string().nullable(),
  /** Kept as a string: it is written straight to `call.recording_duration`, a text column. */
  recordingDuration: z.string().nullable(),
  conferenceSid: z.string().nullable(),
});

/**
 * Anything else. Not an error — see the module doc: webhooks must never 500 on
 * an unexpected body, so the raw params travel with the event and each route
 * keeps whatever fallback it had.
 */
export const unrecognizedCallbackSchema = z.object({
  ...voiceCallbackCommon,
  kind: z.literal("unrecognized"),
});

export const twilioVoiceCallbackSchema = z.discriminatedUnion("kind", [
  callStatusCallbackSchema,
  participantEventSchema,
  recordingEventSchema,
  unrecognizedCallbackSchema,
]);

export type ParticipantEventName = (typeof PARTICIPANT_EVENT_NAMES)[number];
export type CallStatusCallback = z.infer<typeof callStatusCallbackSchema>;
export type ParticipantEvent = z.infer<typeof participantEventSchema>;
export type RecordingEvent = z.infer<typeof recordingEventSchema>;
export type UnrecognizedCallback = z.infer<typeof unrecognizedCallbackSchema>;
export type TwilioVoiceCallback = z.infer<typeof twilioVoiceCallbackSchema>;

export type ParticipantJoinEvent = ParticipantEvent & { event: "participant-join" };
export type ParticipantLeaveEvent = ParticipantEvent & { event: "participant-leave" };

function readString(
  params: Record<string, string>,
  key: string,
): string | null {
  const value = params[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readNumber(params: Record<string, string>, key: string): number | null {
  const raw = readString(params, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The `userId` half of a `${userId}~${uuid}` conference name.
 *
 * Returns null when the value has no `~` separator — a bare `CF…` SID or a
 * legacy name is NOT a user id, and passing one to a `::uuid`-bound argument
 * is the 22P02 crash described on `participantEventSchema`. Callers that only
 * have `call.conference_id` (a stored conference name) use this too.
 */
export function userIdFromConferenceName(
  conferenceName: string | null | undefined,
): string | null {
  if (!conferenceName) return null;
  const separator = conferenceName.indexOf("~");
  if (separator === -1) return null;
  const userId = conferenceName.slice(0, separator);
  return userId === "" ? null : userId;
}

const RECORDING_KEYS = ["RecordingSid", "RecordingUrl", "RecordingStatus"] as const;

/**
 * Parse a Twilio voice webhook form body into exactly one union member.
 *
 * Discrimination, in order:
 *  1. any recording field present (`RecordingSid` / `RecordingUrl` /
 *     `RecordingStatus`) → `recording`. Checked FIRST so a conference
 *     recording callback (which also carries `ConferenceSid` and a
 *     `StatusCallbackEvent`) cannot be mistaken for a participant event and
 *     silently drop its recording fields. The consequence callers rely on:
 *     if `kind !== "recording"`, there are no recording fields to read.
 *  2. a recognized `StatusCallbackEvent` → `participant`.
 *  3. `CallSid` and a non-empty `CallStatus` → `call-status`.
 *  4. otherwise → `unrecognized`.
 */
export function parseTwilioVoiceCallback(
  params: Record<string, string>,
): TwilioVoiceCallback {
  const raw = params ?? {};
  const duration = readNumber(raw, "Duration");
  const callDuration = readNumber(raw, "CallDuration");
  const common = {
    raw,
    callSid: readString(raw, "CallSid"),
    accountSid: readString(raw, "AccountSid"),
    callStatus: readString(raw, "CallStatus") ?? "",
    timestamp: readString(raw, "Timestamp"),
    durationSeconds:
      duration === null && callDuration === null
        ? null
        : Math.max(duration ?? 0, callDuration ?? 0),
    answeredBy: readString(raw, "AnsweredBy"),
  };

  if (RECORDING_KEYS.some((key) => readString(raw, key) !== null)) {
    return {
      ...common,
      kind: "recording",
      recordingSid: readString(raw, "RecordingSid"),
      recordingUrl: readString(raw, "RecordingUrl"),
      recordingStatus: readString(raw, "RecordingStatus"),
      recordingDuration: readString(raw, "RecordingDuration"),
      conferenceSid: readString(raw, "ConferenceSid"),
    };
  }

  const statusCallbackEvent = readString(raw, "StatusCallbackEvent");
  const participantEvent = participantEventName.safeParse(statusCallbackEvent);
  if (participantEvent.success) {
    const conferenceName = readString(raw, "FriendlyName");
    const conferenceSid = readString(raw, "ConferenceSid");
    return {
      ...common,
      kind: "participant",
      event: participantEvent.data,
      conferenceSid,
      conferenceName,
      conferenceRef: conferenceName ?? conferenceSid,
      conferenceUserId: userIdFromConferenceName(conferenceName),
      participantCallSid: readString(raw, "ParticipantCallSid") ?? common.callSid,
      reasonParticipantLeft: readString(raw, "ReasonParticipantLeft"),
    };
  }

  if (common.callSid && common.callStatus) {
    return {
      ...common,
      kind: "call-status",
      callSid: common.callSid,
      callStatus: common.callStatus,
      direction: readString(raw, "Direction"),
      from: readString(raw, "From"),
      to: readString(raw, "To"),
      parentCallSid: readString(raw, "ParentCallSid"),
      sequenceNumber: readString(raw, "SequenceNumber"),
    };
  }

  return { ...common, kind: "unrecognized" };
}

export function isParticipantJoin(
  event: TwilioVoiceCallback,
): event is ParticipantJoinEvent {
  return event.kind === "participant" && event.event === "participant-join";
}

export function isParticipantLeave(
  event: TwilioVoiceCallback,
): event is ParticipantLeaveEvent {
  return event.kind === "participant" && event.event === "participant-leave";
}

/**
 * A participant leave the callee/agent caused by hanging up, as opposed to one
 * the platform caused by ending the conference. Only the former should tear
 * the conference down.
 */
export function isParticipantHangup(
  event: TwilioVoiceCallback,
): event is ParticipantLeaveEvent {
  return isParticipantLeave(event) && event.reasonParticipantLeft === "participant_hung_up";
}
