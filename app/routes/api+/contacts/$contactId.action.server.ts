import { dataPlaneResourceCapabilityAuth } from "@/lib/capability-guard.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import { deleteContactApi, getContactDetailApi } from "@/lib/platform-data.server";

export const loader = defineLoader({
  auth: dataPlaneResourceCapabilityAuth("campaigns.read", "contact", "contactId"),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getContactDetailApi(
      auth.contactId,
      auth.workspaceId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ contact: result.contact }, 200);
  },
});

export const action = defineAction({
  // Destructive mutation: require at least `member`, blocking the `caller` role.
  auth: dataPlaneResourceCapabilityAuth("campaigns.write", "contact", "contactId", {
    minRole: "member",
  }),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method !== "DELETE") {
      return jsonError("Method not allowed", 405);
    }

    const result = await deleteContactApi(
      auth.contactId,
      auth.workspaceId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ success: true, contact_id: result.contact_id }, 200);
  },
});
