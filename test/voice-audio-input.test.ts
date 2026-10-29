import { describe, expect, test } from "vitest";
import { connectPhoneDeviceBodySchema as schema } from "@/lib/schemas/api/common";

const workspaceId = "760071ca-6d0c-4906-82b8-1eb9995bfdee";
const connection_intent_id = "7e791ca1-135b-4ba4-8d89-e942a4701f8c";
const phoneNumber = "+16135550601", callSid = `CA${"1".repeat(32)}`, expected_agent_sid = `CA${"2".repeat(32)}`;
const live = { workspaceId, phoneNumber, callSid, expected_agent_sid, connection_intent_id };

describe("agent audio request contract", () => {
  test("keeps the connection-only legacy phone form", () => {
    expect(schema.parse({ workspaceId, phoneNumber })).toEqual({ workspaceId, phoneNumber });
  });
  test("accepts the optional owned idle campaign and trims the number", () => {
    expect(schema.parse({ workspaceId, phoneNumber: ` ${phoneNumber} `, campaignId: "12" })).toEqual({ workspaceId, phoneNumber, campaignId: 12 });
  });
  test("accepts an explicit live phone replacement with a stable intent and expected source", () => {
    expect(schema.parse(live)).toEqual(live);
  });
  test("accepts a live computer replacement with no client-supplied destination", () => {
    const body = { workspaceId, device: "computer", callSid, expected_agent_sid, connection_intent_id };
    expect(schema.parse(body)).toEqual(body);
  });
  test.each(["userId", "user_id", "clientIdentity", "destination", "conferenceId", "reservationId", "voiceUrl", "statusCallback", "role"])(
    "refuses caller-supplied %s authority", (key) => {
      expect(schema.safeParse({ ...live, [key]: "untrusted" }).success).toBe(false);
    },
  );
  test.each([
    { ...live, connection_intent_id: undefined },
    { ...live, expected_agent_sid: undefined },
    { ...live, campaignId: 12 },
    { ...live, callSid: "CAinvalid" },
    { ...live, expected_agent_sid: "CAinvalid" },
    { ...live, workspaceId: "unknown" },
    { ...live, phoneNumber: "6135550601" },
    { ...live, device: "computer" },
    { workspaceId, device: "computer", connection_intent_id },
    { workspaceId, phoneNumber, expected_agent_sid },
    { workspaceId, phoneNumber, campaignId: "NaN" },
    { workspaceId, phoneNumber, campaignId: -1 },
    { workspaceId, phoneNumber, campaignId: 1.5 },
    { workspaceId, phoneNumber, campaignId: "" },
    { workspaceId, phoneNumber, connection_intent_id: "bad-intent" },
  ])("refuses an incomplete or ambiguous audio change %#", (body) => {
    expect(schema.safeParse(body).success).toBe(false);
  });
});
