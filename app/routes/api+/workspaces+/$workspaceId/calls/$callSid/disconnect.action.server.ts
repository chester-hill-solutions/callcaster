import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineAction } from "@/lib/handler.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { pauseTwiml } from "@/lib/twilio-twiml.server";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs } from "react-router";

function resolveDisconnectAuth({ params, context }: ActionFunctionArgs) {
  const workspaceId = params.workspaceId;
  const callSid = params.callSid;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  if (!callSid) {
    return jsonError("callSid is required", 400);
  }

  getDataPlaneRouteContext(context, workspaceId);
  return { workspaceId, callSid };
}

export const action = defineAction({
  auth: resolveDisconnectAuth,
  sideEffects: ["twilio"],
  handler: async ({ auth }) => {
    const call = await findCallBySid(auth.callSid);
    if (!call || call.workspace !== auth.workspaceId) {
      return jsonError("Call not found", 404);
    }

    const twilio = await createWorkspaceTwilioInstance({
      workspace_id: auth.workspaceId,
    });

    try {
      await twilio.calls(auth.callSid).update({ twiml: pauseTwiml(60) });
      return jsonResponse({ success: true }, 200);
    } catch (error) {
      logger.error("Failed to disconnect call", {
        callSid: auth.callSid,
        workspaceId: auth.workspaceId,
        error,
      });
      return jsonError("Failed to disconnect the call", 500);
    }
  },
});
