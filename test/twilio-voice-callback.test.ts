import { describe, expect, test } from "vitest";

import {
  isParticipantHangup,
  isParticipantJoin,
  isParticipantLeave,
  parseTwilioVoiceCallback,
  twilioVoiceCallbackSchema,
  userIdFromConferenceName,
} from "@/lib/twilio/voice-callback";

describe("parseTwilioVoiceCallback", () => {
  test("parses a plain call status callback", () => {
    const event = parseTwilioVoiceCallback({
      CallSid: "CA1",
      AccountSid: "AC1",
      CallStatus: "completed",
      Timestamp: "2026-08-14T00:00:00.000Z",
      Duration: "60",
      CallDuration: "61",
      AnsweredBy: "machine_start",
      Direction: "outbound-api",
      From: "+15550000001",
      To: "+15550000002",
      ParentCallSid: "CA_PARENT",
      SequenceNumber: "3",
    });

    expect(event.kind).toBe("call-status");
    expect(event).toMatchObject({
      kind: "call-status",
      callSid: "CA1",
      accountSid: "AC1",
      callStatus: "completed",
      answeredBy: "machine_start",
      parentCallSid: "CA_PARENT",
      // The max of Duration/CallDuration every caller used to compute by hand.
      durationSeconds: 61,
    });
  });

  test("call status with neither duration field reports null, not NaN", () => {
    const event = parseTwilioVoiceCallback({ CallSid: "CA1", CallStatus: "ringing" });
    expect(event.kind).toBe("call-status");
    expect(event.durationSeconds).toBeNull();
  });

  test("parses a participant join event", () => {
    const event = parseTwilioVoiceCallback({
      CallSid: "CA1",
      CallStatus: "ringing",
      StatusCallbackEvent: "participant-join",
      ConferenceSid: "CF1",
      FriendlyName: "u1~9f3ae1b2-0000-4000-8000-00000000abcd",
      Timestamp: "2026-08-14T00:00:00.000Z",
    });

    expect(isParticipantJoin(event)).toBe(true);
    expect(event).toMatchObject({
      kind: "participant",
      event: "participant-join",
      conferenceSid: "CF1",
      conferenceName: "u1~9f3ae1b2-0000-4000-8000-00000000abcd",
      conferenceRef: "u1~9f3ae1b2-0000-4000-8000-00000000abcd",
      conferenceUserId: "u1",
      // CallStatus still travels on a participant event — the auto-dial route
      // switches on it before it ever looks at StatusCallbackEvent.
      callStatus: "ringing",
    });
  });

  test("parses a participant leave event with its hangup reason", () => {
    const event = parseTwilioVoiceCallback({
      CallSid: "CA1",
      CallStatus: "ringing",
      StatusCallbackEvent: "participant-leave",
      ReasonParticipantLeft: "participant_hung_up",
      ConferenceSid: "CF1",
      FriendlyName: "u1~9f3ae1b2-0000-4000-8000-00000000abcd",
      Duration: "1",
      CallDuration: "2",
    });

    expect(isParticipantLeave(event)).toBe(true);
    expect(isParticipantHangup(event)).toBe(true);
    expect(event).toMatchObject({ durationSeconds: 2 });
  });

  test("a participant leave the platform caused is not a hangup", () => {
    const event = parseTwilioVoiceCallback({
      CallSid: "CA1",
      StatusCallbackEvent: "participant-leave",
      ReasonParticipantLeft: "conference_ended",
      ConferenceSid: "CF1",
    });
    expect(isParticipantLeave(event)).toBe(true);
    expect(isParticipantHangup(event)).toBe(false);
  });

  /**
   * REGRESSION (#1004, the 22P02 incident). Conference names are minted as
   * `${userId}~${uuid}` and `dequeue_contact` binds the user argument as
   * `::uuid`. Passing the conference NAME raised
   * `invalid input syntax for type uuid` on every terminal call, so contacts
   * were never dequeued and the dialer stopped after one call. The parser must
   * keep the name, the SID and the user id as three separate values — never
   * collapse them into one "conference id".
   */
  test("keeps the conference name, SID and user id distinct (22P02 regression)", () => {
    const userId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const conferenceName = `${userId}~9f3ae1b2-0000-4000-8000-00000000abcd`;
    const event = parseTwilioVoiceCallback({
      CallSid: "CA1",
      StatusCallbackEvent: "participant-join",
      ConferenceSid: "CF_NOT_A_UUID",
      FriendlyName: conferenceName,
    });

    expect(event.kind).toBe("participant");
    if (event.kind !== "participant") return;
    expect(event.conferenceName).toBe(conferenceName);
    expect(event.conferenceSid).toBe("CF_NOT_A_UUID");
    expect(event.conferenceUserId).toBe(userId);
    expect(event.conferenceUserId).not.toBe(conferenceName);
    expect(event.conferenceRef).toBe(conferenceName);
  });

  test("a conference name with no separator yields no user id", () => {
    const event = parseTwilioVoiceCallback({
      CallSid: "CA1",
      StatusCallbackEvent: "participant-join",
      ConferenceSid: "CF1",
      FriendlyName: "in-progress",
    });
    expect(event.kind).toBe("participant");
    if (event.kind !== "participant") return;
    expect(event.conferenceUserId).toBeNull();
    expect(event.conferenceRef).toBe("in-progress");
  });

  test("falls back to the conference SID when there is no friendly name", () => {
    const event = parseTwilioVoiceCallback({
      CallSid: "CA1",
      StatusCallbackEvent: "participant-join",
      ConferenceSid: "CF1",
    });
    expect(event.kind).toBe("participant");
    if (event.kind !== "participant") return;
    expect(event.conferenceName).toBeNull();
    expect(event.conferenceRef).toBe("CF1");
  });

  test("parses a recording status callback", () => {
    const event = parseTwilioVoiceCallback({
      CallSid: "CA1",
      AccountSid: "AC1",
      RecordingSid: "RE1",
      RecordingUrl: "https://api.twilio.com/rec",
      RecordingStatus: "completed",
      RecordingDuration: "42",
    });

    expect(event).toMatchObject({
      kind: "recording",
      recordingSid: "RE1",
      recordingUrl: "https://api.twilio.com/rec",
      recordingStatus: "completed",
      // A string, because it is written straight to a text column.
      recordingDuration: "42",
      accountSid: "AC1",
    });
  });

  /**
   * Recording wins over the participant check so a conference recording
   * callback (which also carries ConferenceSid + StatusCallbackEvent) does not
   * silently lose its recording fields. Callers depend on the converse:
   * `kind !== "recording"` means there is nothing recording-shaped to read.
   */
  test("a conference recording callback parses as a recording, not a participant event", () => {
    const event = parseTwilioVoiceCallback({
      CallSid: "CA1",
      ConferenceSid: "CF1",
      StatusCallbackEvent: "conference-end",
      RecordingSid: "RE1",
      RecordingUrl: "https://api.twilio.com/rec",
    });
    expect(event.kind).toBe("recording");
    if (event.kind !== "recording") return;
    expect(event.conferenceSid).toBe("CF1");
  });

  test("an unknown StatusCallbackEvent with a CallStatus is still a call status callback", () => {
    const event = parseTwilioVoiceCallback({
      CallSid: "CA1",
      CallStatus: "ringing",
      StatusCallbackEvent: "something-twilio-added-later",
    });
    expect(event.kind).toBe("call-status");
  });

  test("returns UnrecognizedCallback carrying the raw params instead of throwing", () => {
    const raw = { Nonsense: "yes", Another: "1" };
    const event = parseTwilioVoiceCallback(raw);
    expect(event.kind).toBe("unrecognized");
    expect(event.raw).toEqual(raw);
    expect(event.callSid).toBeNull();
    expect(event.callStatus).toBe("");
  });

  test("an empty body is unrecognized, not an error", () => {
    expect(() => parseTwilioVoiceCallback({})).not.toThrow();
    expect(parseTwilioVoiceCallback({}).kind).toBe("unrecognized");
  });

  test("a CallSid with no CallStatus is unrecognized", () => {
    const event = parseTwilioVoiceCallback({ CallSid: "CA1" });
    expect(event.kind).toBe("unrecognized");
    expect(event.callSid).toBe("CA1");
  });

  test("blank and non-string field values read as absent", () => {
    const event = parseTwilioVoiceCallback({
      CallSid: "  CA1  ",
      CallStatus: "completed",
      AnsweredBy: "   ",
      Duration: "not-a-number",
      To: undefined as unknown as string,
    });
    expect(event.kind).toBe("call-status");
    if (event.kind !== "call-status") return;
    expect(event.callSid).toBe("CA1");
    expect(event.answeredBy).toBeNull();
    expect(event.to).toBeNull();
    expect(event.durationSeconds).toBeNull();
  });

  test("every parse result satisfies the schema the job payload validates against", () => {
    const bodies = [
      { CallSid: "CA1", CallStatus: "completed", Duration: "10" },
      { CallSid: "CA1", StatusCallbackEvent: "participant-join", ConferenceSid: "CF1" },
      { CallSid: "CA1", RecordingSid: "RE1" },
      { Nothing: "here" },
    ];
    for (const body of bodies) {
      expect(twilioVoiceCallbackSchema.safeParse(parseTwilioVoiceCallback(body)).success).toBe(
        true,
      );
    }
  });
});

describe("userIdFromConferenceName", () => {
  test("returns the prefix before the separator", () => {
    expect(userIdFromConferenceName("u1~abc")).toBe("u1");
  });

  test("returns null for a name with no separator, so no ::uuid bind gets a conference name", () => {
    expect(userIdFromConferenceName("CF1")).toBeNull();
    expect(userIdFromConferenceName(null)).toBeNull();
    expect(userIdFromConferenceName(undefined)).toBeNull();
    expect(userIdFromConferenceName("")).toBeNull();
    expect(userIdFromConferenceName("~abc")).toBeNull();
  });
});
