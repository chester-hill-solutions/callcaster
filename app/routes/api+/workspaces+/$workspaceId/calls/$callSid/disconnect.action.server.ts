import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { dataPlaneCapabilityAuthWithParam } from "@/lib/capability-guard.server";
import { safeRecordWorkspaceAuditEvent } from "@/lib/audit-event.server";
import { defineAction } from "@/lib/handler.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { pauseTwiml } from "@/lib/twilio-twiml.server";
import { logger } from "@/lib/logger.server";

export const action = defineAction({
  auth: dataPlaneCapabilityAuthWithParam("calls.control", "callSid"),
  sideEffects: ["twilio", "db-write"],
  handler: async ({ request, auth }) => {
    const actorType = auth.auth.userId ? ("session" as const) : ("api_key" as const);
    const actorId = auth.auth.userId;
    const requestId = request.headers.get("x-request-id");

    const call = await findCallBySid(auth.callSid);
    if (!call || call.workspace !== auth.workspaceId) {
      await safeRecordWorkspaceAuditEvent({
        workspaceId: auth.workspaceId,
        actorType,
        actorId,
        action: "calls.disconnect",
        targetType: "call",
        targetId: auth.callSid,
        outcome: "failure",
        requestId,
      });
      return jsonError("Call not found", 404);
    }

    const twilio = await createWorkspaceTwilioInstance({
      workspace_id: auth.workspaceId,
    });

    try {
      await twilio.calls(auth.callSid).update({ twiml: pauseTwiml(60) });
      await safeRecordWorkspaceAuditEvent({
        workspaceId: auth.workspaceId,
        actorType,
        actorId,
        action: "calls.disconnect",
        targetType: "call",
        targetId: auth.callSid,
        outcome: "success",
        requestId,
      });
      return jsonResponse({ success: true }, 200);
    } catch (error) {
      logger.error("Failed to disconnect call", {
        callSid: auth.callSid,
        workspaceId: auth.workspaceId,
        error,
      });
      await safeRecordWorkspaceAuditEvent({
        workspaceId: auth.workspaceId,
        actorType,
        actorId,
        action: "calls.disconnect",
        targetType: "call",
        targetId: auth.callSid,
        outcome: "failure",
        requestId,
      });
      return jsonError("Failed to disconnect the call", 500);
    }
  },
});
