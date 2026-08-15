import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import {
  deleteMemberBodySchema,
  inviteMemberBodySchema,
  updateMemberBodySchema,
} from "@/lib/schemas/api/platform-workspace-admin";
import {
  cancelWorkspaceInvite,
  inviteWorkspaceMember,
  inviteWorkspaceMemberAsApiKey,
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "@/lib/platform-members.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  dataPlaneSessionMinRoleAuth,
  requireDataPlaneRouteCapability,
} from "@/lib/capability-guard.server";
import { MemberRole } from "@/lib/member-role";
import type { DataPlaneAuthContextValue } from "@/lib/route-context.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

type MembersActionAuth =
  | { mode: "invite"; workspaceId: string; auth: DataPlaneAuthContextValue }
  | { mode: "session"; workspaceId: string; userId: string };

/** Session-only member gate shared by the non-POST branches below. */
const sessionMemberAuth = dataPlaneSessionMinRoleAuth(MemberRole.Caller);

/**
 * Only POST (invite) declares a capability (`members.invite`); PATCH/DELETE
 * are session-only per API_SURFACE, role-gated further down inside
 * updateWorkspaceMemberRole/removeWorkspaceMember/cancelWorkspaceInvite. One
 * `action` export backs all three methods, and the capability-linkage check
 * resolves a single enforced capability per handler export (not per method),
 * so branding this export with `dataPlaneCapabilityAuth("members.invite")`
 * would falsely claim PATCH/DELETE enforce it too and fail the truthfulness
 * check. This stays a hand-rolled, per-method dispatch — see the PR body for
 * why `POST /api/workspaces/:workspaceId/members` is still baselined.
 */
async function membersActionAuth({
  request,
  params,
  context,
}: ActionFunctionArgs): Promise<MembersActionAuth | Response> {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  if (request.method === "POST") {
    const gated = await requireDataPlaneRouteCapability(
      context,
      workspaceId,
      "members.invite",
    );
    if (gated instanceof Response) {
      return gated;
    }
    if (!gated.auth.userId && !gated.auth.apiKey) {
      return jsonError("Unauthorized", 401);
    }
    return { mode: "invite", workspaceId, auth: gated.auth };
  }

  const sessionResult = await sessionMemberAuth({ params, context });
  if (sessionResult instanceof Response) {
    return sessionResult;
  }
  return { mode: "session", workspaceId, userId: sessionResult.userId };
}

export const loader = defineLoader({
  // GET is session-only per API_SURFACE (no capability declared); any member
  // may list. Not capability-carrying — see the module-level note above
  // `action` for why the invite capability can't be linked either.
  auth: dataPlaneSessionMinRoleAuth(MemberRole.Caller),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const { workspaceId, userId } = auth;

    const result = await listWorkspaceMembers(userId, workspaceId);

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
  },
});

export const action = defineAction({
  auth: membersActionAuth,
  sideEffects: ["db-write", "email"],
  handler: async ({ request, auth }) => {
    const { workspaceId } = auth;

    if (request.method === "POST" && auth.mode === "invite") {
      const parsed = await parseJsonBodyOrResponse(request, inviteMemberBodySchema);
      if (parsed instanceof Response) return parsed;

      const result =
        auth.auth.userId != null
          ? await inviteWorkspaceMember(
              auth.auth.userId,
              workspaceId,
              parsed.email,
              parsed.role,
            )
          : await inviteWorkspaceMemberAsApiKey(
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

    if (auth.mode !== "session") {
      return jsonError("Unauthorized", 401);
    }
    const { userId } = auth;

    if (request.method === "PATCH") {
      const parsed = await parseJsonBodyOrResponse(request, updateMemberBodySchema);
      if (parsed instanceof Response) return parsed;

      const result = await updateWorkspaceMemberRole(
        userId,
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
          userId,
          workspaceId,
          parsed.user_id,
        );
        if (!inviteResult.ok) {
          return jsonError(inviteResult.error, inviteResult.status);
        }
        return jsonResponse({ success: true, invites: inviteResult.invites }, 200);
      }

      const removeResult = await removeWorkspaceMember(
        userId,
        workspaceId,
        parsed.user_id,
      );
      if (removeResult.ok) {
        return jsonResponse({ success: true, member: removeResult.member }, 200);
      }

      const inviteResult = await cancelWorkspaceInvite(
        userId,
        workspaceId,
        parsed.user_id,
      );
      if (inviteResult.ok && inviteResult.invites.length > 0) {
        return jsonResponse({ success: true, invites: inviteResult.invites }, 200);
      }

      return jsonError(removeResult.error, removeResult.status);
    }

    return jsonError("Method not allowed", 405);
  },
});
