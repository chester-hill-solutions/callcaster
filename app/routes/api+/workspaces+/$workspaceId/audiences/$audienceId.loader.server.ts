import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getAudienceDetailApi,
} from "@/lib/audience-detail.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: ({ params, context }: LoaderFunctionArgs) => {
    const workspaceId = params.workspaceId;
    const audienceId = params.audienceId;
    if (!workspaceId || !audienceId) {
      return jsonError("workspaceId and audienceId are required", 400);
    }
    getDataPlaneRouteContext(context, workspaceId);

    return { workspaceId, audienceId };
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
