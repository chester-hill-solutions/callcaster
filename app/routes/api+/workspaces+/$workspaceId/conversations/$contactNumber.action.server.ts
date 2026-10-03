import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  markMessageAsDeliveredBySid,
  markReceivedMessagesAsDeliveredForPhone,
} from "@/lib/message-db.server";
import { dataPlaneCapabilityAuthWithParam } from "@/lib/capability-guard.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: dataPlaneCapabilityAuthWithParam("campaigns.read", "contactNumber"),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }
    const { workspaceId, contactNumber } = auth;
    const decodedContactNumber = decodeURIComponent(contactNumber);
    let messageSid: string | undefined;
    try {
      const body = (await request.json()) as { sid?: string };
      messageSid = body.sid;
    } catch {
      messageSid = undefined;
    }

    try {
      if (messageSid) {
        await markMessageAsDeliveredBySid(workspaceId, messageSid);
      } else {
        await markReceivedMessagesAsDeliveredForPhone(workspaceId, decodedContactNumber);
      }
      return jsonResponse({ ok: true }, 200);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to mark conversation read",
        500,
      );
    }
  },
});
