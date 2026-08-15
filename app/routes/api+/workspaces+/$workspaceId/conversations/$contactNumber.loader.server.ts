import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { fetchLatestMessageForPhone } from "@/lib/message-db.server";
import {
  getConversationMessagesApi,
} from "@/lib/platform-data.server";
import { dataPlaneCapabilityAuthWithParam } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuthWithParam("campaigns.read", "contactNumber"),
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
    const { workspaceId, contactNumber } = auth;
    const decodedContactNumber = decodeURIComponent(contactNumber);

    if (url.searchParams.get("latest") === "1") {
      try {
        const latestMessage = await fetchLatestMessageForPhone(
          workspaceId,
          decodedContactNumber,
        );
        return jsonResponse({ latest_message: latestMessage }, 200);
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : "Failed to load latest message",
          500,
        );
      }
    }

    const result = await getConversationMessagesApi(
      workspaceId,
      decodedContactNumber,
      url.searchParams,
    );

    return jsonResponse(
      {
        contact_number: result.contact_number,
        messages: result.messages,
        has_more: result.has_more,
      },
      200,
    );
  },
});
