import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getAudienceDetailApi,
  resolveDataPlaneAuth,
} from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  const audienceId = params.audienceId;
  if (!workspaceId || !audienceId) {
    return jsonError("workspaceId and audienceId are required", 400);
  }

  const auth = await resolveDataPlaneAuth(request, workspaceId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const result = await getAudienceDetailApi(
    auth.supabase,
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
