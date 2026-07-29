import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getAudienceDetailApi,
} from "@/lib/audience-detail.server";
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
    return { ...gated, audienceId };
  },
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
