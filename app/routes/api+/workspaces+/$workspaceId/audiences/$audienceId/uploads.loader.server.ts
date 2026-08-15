import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { listAudienceUploadsByAudienceId } from "@/lib/audience-upload-db.server";
import { dataPlaneCapabilityAuthWithParam } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuthWithParam("campaigns.read", "audienceId"),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const parsedAudienceId = Number.parseInt(auth.audienceId, 10);
    if (Number.isNaN(parsedAudienceId)) {
      return jsonError("Invalid audienceId", 400);
    }

    try {
      const uploads = await listAudienceUploadsByAudienceId(auth.workspaceId, parsedAudienceId);
      return jsonResponse({ uploads }, 200);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to load audience uploads",
        500,
      );
    }
  },
});
