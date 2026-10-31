import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import {
  dataPlaneCapabilityAuth,
  dataPlaneSessionMinRoleAuth,
} from "@/lib/capability-guard.server";
import { MemberRole } from "@/lib/member-role";
import { updateWorkspaceBodySchema, workspaceArchiveResponseSchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  deleteWorkspaceApi,
  getWorkspaceDetailForDataPlane,
  updateWorkspaceName,
} from "@/lib/platform-workspace.server";
import { defineAction, defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuth("campaigns.read"),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getWorkspaceDetailForDataPlane(
      auth.auth.userId,
      auth.workspaceId,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ workspace: result.workspace }, 200);
  },
});

export const action = defineAction({
  // PATCH/DELETE declare no capability (session-only, role-gated further down
  // in updateWorkspaceName/deleteWorkspaceApi); any member may reach the
  // handler, same as the userId-only gate this replaces.
  auth: dataPlaneSessionMinRoleAuth(MemberRole.Caller),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method === "PATCH") {
      const parsed = await parseJsonBodyOrResponse(request, updateWorkspaceBodySchema);
      if (parsed instanceof Response) return parsed;

      if (!parsed.name) {
        return jsonError("name is required", 400);
      }

      const result = await updateWorkspaceName(
        auth.userId,
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
        auth.userId,
        auth.workspaceId,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse(workspaceArchiveResponseSchema.parse({ success: true, revoked_api_keys: result.revokedApiKeys }), 200);
    }

    return jsonError("Method not allowed", 405);
  },
});
