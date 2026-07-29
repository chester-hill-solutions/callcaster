import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { findContactsByPhone } from "@/lib/database/contact.server";
import {
  listWorkspaceContactsApi,
} from "@/lib/platform-data.server";
import { dataPlaneCapabilityAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuth("campaigns.read"),
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
    const { workspaceId } = auth;
    const phone = url.searchParams.get("phone");
    if (phone) {
      try {
        const contacts = await findContactsByPhone(workspaceId, phone);
        return jsonResponse({ contacts }, 200);
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : "Failed to search contacts by phone",
          500,
        );
      }
    }

    const result = await listWorkspaceContactsApi(
      workspaceId,
      url.searchParams,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      {
        contacts: result.contacts,
        pagination: result.pagination,
        search_query: result.search_query,
      },
      200,
    );
  },
});
