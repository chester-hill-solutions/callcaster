import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { listAudienceUploadsByAudienceId } from "@/lib/audience-upload-db.server";
import { requireDataPlaneRouteCapability } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: async ({ params, context }: LoaderFunctionArgs) => {
    const workspaceId = params.workspaceId;
    const audienceId = params.audienceId;
    if (!workspaceId || !audienceId) {
      return jsonError("workspaceId and audienceId are required", 400);
    }
    const gated = await requireDataPlaneRouteCapability(
      context,
      workspaceId,
      "campaigns.read",
    );
    if (gated instanceof Response) return gated;

    const parsedAudienceId = Number.parseInt(audienceId, 10);
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
