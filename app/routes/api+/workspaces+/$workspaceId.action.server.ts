import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { getSession } from "@/lib/auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import {
  transferOwnershipBodySchema,
  updateWorkspaceBodySchema,
} from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  deleteWorkspaceApi,
  getWorkspaceDetail,
  transferWorkspaceOwnershipApi,
  updateWorkspaceName,
} from "@/lib/platform-workspace.server";
import { defineAction, defineLoader } from "@/lib/handler.server";

async function requireJsonAuthWithWorkspaceId({
  request,
  params,
}: {
  request: Request;
  params: Record<string, string | undefined>;
}) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  return { ...auth, workspaceId };
}

export const loader = defineLoader({
  auth: requireJsonAuthWithWorkspaceId,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getWorkspaceDetail(    auth.user.id,
      auth.workspaceId,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ workspace: result.workspace }, 200);
  },
});

export const action = defineAction({
  auth: requireJsonAuthWithWorkspaceId,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const { headers } = await getSession(request);
    if (request.method === "PATCH") {
      const parsed = await parseJsonBodyOrResponse(request, updateWorkspaceBodySchema);
      if (parsed instanceof Response) return parsed;

      if (!parsed.name) {
        return jsonError("name is required", 400);
      }

      const result = await updateWorkspaceName(
        auth.user.id,
        auth.workspaceId,
        parsed.name,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ workspace: result.workspace }, 200);
    }

    if (request.method === "DELETE") {
      const result = await deleteWorkspaceApi(
        auth.user.id,
        auth.workspaceId,
        headers,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ success: true }, 200);
    }

    return jsonError("Method not allowed", 405);
  },
});
