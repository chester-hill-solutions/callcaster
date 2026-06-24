import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { getWorkspaceCallLogApi } from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  try {
    const result = await getWorkspaceCallLogApi(
      getAuthSupabaseClient(auth),
      auth.user.id,
      workspaceId,
      request.url,
    );

    const { ok: _ok, ...payload } = result;
    return jsonResponse(payload, 200);
  } catch (error) {
    return createErrorResponse(error, "Failed to load call log");
  }
}
