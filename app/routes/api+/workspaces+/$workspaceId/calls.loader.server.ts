import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { getWorkspaceCallLogApi } from "@/lib/platform-telephony.server";
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
    const result = await getWorkspaceCallLogApi(
      auth.user.id,
      workspaceId,
      url.href,
    );

    const { ok: _ok, ...payload } = result;
    return jsonResponse(payload, 200);
  } catch (error) {
    return createErrorResponse(error, "Failed to load call log");
  }
}
