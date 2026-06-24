import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  listWorkspaceContactsApi,
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
  const result = await listWorkspaceContactsApi(
    auth.supabase,
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
}
