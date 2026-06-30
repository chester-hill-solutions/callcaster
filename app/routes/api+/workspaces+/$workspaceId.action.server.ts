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
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const result = await getWorkspaceDetail(    auth.user.id,
    workspaceId,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ workspace: result.workspace }, 200);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const { headers } = await getSession(request);
  if (request.method === "PATCH") {
    const parsed = await parseJsonBodyOrResponse(request, updateWorkspaceBodySchema);
    if (parsed instanceof Response) return parsed;

    if (!parsed.name) {
      return jsonError("name is required", 400);
    }

    const result = await updateWorkspaceName(
      client,
      auth.user.id,
      workspaceId,
      parsed.name,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ workspace: result.workspace }, 200);
  }

  if (request.method === "DELETE") {
    const result = await deleteWorkspaceApi(
      client,
      auth.user.id,
      workspaceId,
      headers,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ success: true }, 200);
  }

  return jsonError("Method not allowed", 405);
}
