import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import {
  deleteMemberBodySchema,
  inviteMemberBodySchema,
  updateMemberBodySchema,
} from "@/lib/schemas/api/platform-workspace-admin";
import {
  cancelWorkspaceInvite,
  inviteWorkspaceMember,
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "@/lib/platform-members.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const result = await listWorkspaceMembers(    auth.user.id,
    workspaceId,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(
    {
      members: result.members,
      pending_invites: result.pending_invites,
    },
    200,
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  if (request.method === "POST") {
    const parsed = await parseJsonBodyOrResponse(request, inviteMemberBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await inviteWorkspaceMember(
      auth.user.id,
      workspaceId,
      parsed.email,
      parsed.role,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      {
        invite: "invite" in result ? result.invite : undefined,
        warning: "warning" in result ? result.warning : undefined,
        success: true,
      },
      201,
    );
  }

  if (request.method === "PATCH") {
    const parsed = await parseJsonBodyOrResponse(request, updateMemberBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await updateWorkspaceMemberRole(
      auth.user.id,
      workspaceId,
      parsed.user_id,
      parsed.role,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ member: result.member }, 200);
  }

  if (request.method === "DELETE") {
    const parsed = await parseJsonBodyOrResponse(request, deleteMemberBodySchema);
    if (parsed instanceof Response) return parsed;

    if (parsed.target === "invite") {
      const inviteResult = await cancelWorkspaceInvite(
        auth.user.id,
        workspaceId,
        parsed.user_id,
      );
      if (!inviteResult.ok) {
        return jsonError(inviteResult.error, inviteResult.status);
      }
      return jsonResponse({ success: true, invites: inviteResult.invites }, 200);
    }

    const removeResult = await removeWorkspaceMember(
      auth.user.id,
      workspaceId,
      parsed.user_id,
    );
    if (removeResult.ok) {
      return jsonResponse({ success: true, member: removeResult.member }, 200);
    }

    const inviteResult = await cancelWorkspaceInvite(
      auth.user.id,
      workspaceId,
      parsed.user_id,
    );
    if (inviteResult.ok && inviteResult.invites.length > 0) {
      return jsonResponse({ success: true, invites: inviteResult.invites }, 200);
    }

    return jsonError(removeResult.error, removeResult.status);
  }

  return jsonError("Method not allowed", 405);
}
