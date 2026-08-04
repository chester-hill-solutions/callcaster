import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { listAudienceUploadsByAudienceId } from "@/lib/audience-upload-db.server";
import { dataPlaneCapabilityAuthWithParam } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: async (args) => {
    const gated = await dataPlaneCapabilityAuthWithParam(
      "campaigns.read",
      "audienceId",
    )(args);
    if (gated instanceof Response) return gated;

    const parsedAudienceId = Number.parseInt(gated.audienceId, 10);
    if (Number.isNaN(parsedAudienceId)) {
      return jsonError("Invalid audienceId", 400);
    }

    return { workspaceId: gated.workspaceId, parsedAudienceId };
  },
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    try {
      const uploads = await listAudienceUploadsByAudienceId(auth.workspaceId, auth.parsedAudienceId);
      return jsonResponse({ uploads }, 200);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to load audience uploads",
        500,
      );
    }
  },
});
