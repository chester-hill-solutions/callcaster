import { describe, expect, test } from "vitest";
import { voiceDialerStopBodySchema, voiceDialerStopSnapshotSchema } from "@/lib/schemas/api/voice-dialer-stop";
const request = { workspaceId: "10000000-0000-4000-8000-000000000001", campaignId: 42, dial_intent_id: "20000000-0000-4000-8000-000000000001" };

describe("captured Stop wire identity", () => {
  test.each([42, "42"])("accepts a positive exact campaign identity: %s", campaignId => {
    expect(voiceDialerStopBodySchema.parse({ ...request, campaignId })).toEqual(request);
  });
  test.each([null, true, false, "", "0", "01", "1.5", -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])("refuses invalid campaign %s", campaignId => {
    expect(voiceDialerStopBodySchema.safeParse({ ...request, campaignId }).success).toBe(false);
  });
  test.each(["workspaceId", "campaignId", "dial_intent_id"])("requires the captured %s", field => {
    expect(voiceDialerStopBodySchema.safeParse({ ...request, [field]: undefined }).success).toBe(false);
  });
  test("a room alone cannot replace the captured request and an unknown field cannot choose another actor", () => {
    expect(voiceDialerStopBodySchema.safeParse({ workspaceId: request.workspaceId, conferenceName: "agent~room" }).success).toBe(false);
    expect(voiceDialerStopBodySchema.safeParse({ ...request, userId: "other-agent" }).success).toBe(false);
  });
  test.each(["pending", "stopped"])("response %s retains the exact request identity", stop_state => {
    expect(voiceDialerStopSnapshotSchema.safeParse({ success: true, workspace_id: request.workspaceId, user_id: "agent", campaign_id: 42,
      intent_id: request.dial_intent_id, conference_id: null, stop_state }).success).toBe(true);
  });
});
