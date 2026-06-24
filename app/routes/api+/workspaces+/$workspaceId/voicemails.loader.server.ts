import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { listWorkspaceVoicemailsApi } from "@/lib/platform-media.server";
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
    const result = await listWorkspaceVoicemailsApi(
      getAuthSupabaseClient(auth),
      auth.user.id,
      workspaceId,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ voicemails: result.audios }, 200);
  } catch (error) {
    return createErrorResponse(error, "Failed to list voicemails");
  }
}
