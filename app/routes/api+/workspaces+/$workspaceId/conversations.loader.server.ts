import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  listWorkspaceConversationsApi,
  resolveDataPlaneAuth,
} from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const auth = await resolveDataPlaneAuth(request, workspaceId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const result = await listWorkspaceConversationsApi(
    auth.client,
    workspaceId,
    url.searchParams,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(
    {
      conversations: result.conversations,
      pagination: result.pagination,
    },
    200,
  );
}
