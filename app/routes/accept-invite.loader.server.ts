import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import { findUserIdByUsername, getWorkspaceById } from "@/lib/workspace-members-db.server";
import {
  getWorkspaceInvitationById,
  listUserPendingInvitationsByEmail,
  type WorkspaceInvitationAppRow,
} from "@/lib/workspace-invitations.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderData } from "./accept-invite.types";

type InviteLinkResolution =
  | { ok: true; invite: WorkspaceInvitationAppRow; workspaceName: string; token: string }
  | { ok: false; error: string };

/**
 * Resolve the emailed invite link (`invitationId` + raw token) into a pending
 * invite. Returns null when the link is missing so callers fall through to the
 * corresponding no-params state.
 */
async function resolveInviteLink(
  invitationId: string | null,
  token: string | null,
): Promise<InviteLinkResolution | null> {
  if (!invitationId || !token) {
    return null;
  }
  const invite = await getWorkspaceInvitationById(invitationId);
  if (!invite || invite.status !== "pending") {
    return {
      ok: false,
      error:
        "The invitation link is invalid or has expired. Please request a new invitation.",
    };
  }
  const workspace = await getWorkspaceById(invite.workspace_id);
  return {
    ok: true,
    invite,
    workspaceName: workspace?.name ?? "this workspace",
    token,
  };
}

export const loader = defineLoader({
  auth: ({ request }) => getSession(request),
  sideEffects: ["db-read"],
  handler: async ({ request, url, auth: session }) => {
    const { user, headers } = session;
    const invitationId = url.searchParams.get("invitationId");
    const token = url.searchParams.get("token");

    if (!user) {
      const linkState = await resolveInviteLink(invitationId, token);
      if (linkState) {
        if (!linkState.ok) {
          return routeData<LoaderData>(
            { status: "invalid_link", error: linkState.error },
            { headers },
          );
        }
        const accountExists = (await findUserIdByUsername(linkState.invite.email)) != null;
        return routeData<LoaderData>(
          {
            status: accountExists ? "sign_in_required" : "create_account",
            email: linkState.invite.email,
            invitationId: linkState.invite.id,
            token: linkState.token,
            workspaceName: linkState.workspaceName,
          },
          { headers },
        );
      }
      return routeData<LoaderData>({ status: "not_signed_in" }, { headers });
    }

    const email = user.email?.toLowerCase().trim() ?? "";

    // Signed-in visitor landing on the emailed link: validate and offer redeem.
    if (invitationId && token) {
      const linkState = await resolveInviteLink(invitationId, token);
      if (linkState) {
        if (!linkState.ok) {
          return routeData<LoaderData>(
            { status: "invalid_link", error: linkState.error },
            { headers },
          );
        }
        if (linkState.invite.email.toLowerCase() !== email) {
          return routeData<LoaderData>(
            {
              status: "invalid_link",
              error:
                "The invitation link was sent to a different email address than the account you are signed in with.",
            },
            { headers },
          );
        }
        return routeData<LoaderData>(
          {
            status: "redeem_ready",
            workspaceName: linkState.workspaceName,
            invitationId: linkState.invite.id,
            token: linkState.token,
          },
          { headers },
        );
      }
    }

    const invites = await listUserPendingInvitationsByEmail(email);
    return routeData<LoaderData>(
      { status: "existing_user", invites, email },
      { headers },
    );
  },
});