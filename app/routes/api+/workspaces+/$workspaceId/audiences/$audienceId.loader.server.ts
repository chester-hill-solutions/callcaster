import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getAudienceDetailApi,
} from "@/lib/platform-data.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  const audienceId = params.audienceId;
  if (!workspaceId || !audienceId) {
    return jsonError("workspaceId and audienceId are required", 400);
  }
  getDataPlaneRouteContext(context, workspaceId);

  const url = new URL(request.url);
  const result = await getAudienceDetailApi(
    workspaceId,
    audienceId,
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
    },
    200,
  );
}
