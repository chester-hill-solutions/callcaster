import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getAudienceDetailApi,
} from "@/lib/audience-detail.server";
import { dataPlaneCapabilityAuthWithParam } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: (args) =>
    dataPlaneCapabilityAuthWithParam("campaigns.read", "audienceId")(args),
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
    const result = await getAudienceDetailApi(
      auth.workspaceId,
      auth.audienceId,
      url.searchParams,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      {
        audience: result.audience,
        contacts: result.contacts,
        pagination: result.pagination,
        sorting: result.sorting,
        latest_upload: result.latest_upload,
        contacts_error: result.contacts_error,
      },
      200,
    );
  },
});
