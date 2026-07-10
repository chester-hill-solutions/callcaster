import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { getWorkspaceAnalyticsApi } from "@/lib/platform-analytics.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, url}: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  try {
    const result = await getWorkspaceAnalyticsApi(
      auth.user.id,
      workspaceId,
      url.href,
    );

    return jsonResponse({ analytics: result.analytics }, 200);
  } catch (error) {
    return createErrorResponse(error, "Failed to load analytics");
  }
}
