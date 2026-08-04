import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { requireDataPlaneCapability } from "@/lib/capability-guard.server";
import { safeRecordWorkspaceAuditEvent } from "@/lib/audit-event.server";
import { defineAction } from "@/lib/handler.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { pauseTwiml } from "@/lib/twilio-twiml.server";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs } from "react-router";

async function resolveDisconnectAuth({ params, context, request }: ActionFunctionArgs) {
  const workspaceId = params.workspaceId;
  const callSid = params.callSid;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  if (!callSid) {
    return jsonError("callSid is required", 400);
  }

  const dataPlane = getDataPlaneRouteContext(context, workspaceId);
  const capability = await requireDataPlaneCapability(dataPlane, "calls.control");
  if (capability instanceof Response) {
    return capability;
  }

  return {
    workspaceId,
    callSid,
    actorType: dataPlane.userId ? ("session" as const) : ("api_key" as const),
    actorId: dataPlane.userId,
    requestId: request.headers.get("x-request-id"),
  };
}

export const action = defineAction({
  auth: resolveDisconnectAuth,
  sideEffects: ["twilio", "db-write"],
  handler: async ({ auth }) => {
    const call = await findCallBySid(auth.callSid);
    if (!call || call.workspace !== auth.workspaceId) {
      await safeRecordWorkspaceAuditEvent({
        workspaceId: auth.workspaceId,
        actorType: auth.actorType,
        actorId: auth.actorId,
        action: "calls.disconnect",
        targetType: "call",
        targetId: auth.callSid,
        outcome: "failure",
        requestId: auth.requestId,
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
        actorType: auth.actorType,
        actorId: auth.actorId,
        action: "calls.disconnect",
        targetType: "call",
        targetId: auth.callSid,
        outcome: "success",
        requestId: auth.requestId,
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
        actorType: auth.actorType,
        actorId: auth.actorId,
        action: "calls.disconnect",
        targetType: "call",
        targetId: auth.callSid,
        outcome: "failure",
        requestId: auth.requestId,
      });
      return jsonError("Failed to disconnect the call", 500);
    }
  },
});
