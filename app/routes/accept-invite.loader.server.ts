import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import {
  findUserIdByUsername,
  getWorkspaceById,
} from "@/lib/workspace-members-db.server";
import {
  getWorkspaceInvitationById,
  listUserPendingInvitationsByEmail,
} from "@/lib/workspace-invitations.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderData, PendingInvitation } from "./accept-invite.types";

async function loadPendingInvitationsByEmail(
  email: string,
): Promise<PendingInvitation[]> {
  const rows = await listUserPendingInvitationsByEmail(email);
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
    workspace: {
      id: row.workspace.id,
      name: row.workspace.name,
    },
  }));
}

/**
 * Resolve the emailed invite link (`invitationId` + raw token) for a signed-out
 * visitor into a signup or sign-in prompt. Returns null when the link is
 * missing so the caller can fall through to the no-params states.
 */
async function inviteLinkState(
  invitationId: string | null,
  token: string | null,
): Promise<LoaderData | null> {
  if (!invitationId || !token) {
    return null;
  }
  const invite = await getWorkspaceInvitationById(invitationId);
  if (!invite || invite.status !== "pending") {
    return {
      status: "invalid_link",
      error:
        "The invitation link is invalid or has expired. Please request a new invitation.",
    };
  }
  const workspace = await getWorkspaceById(invite.workspace_id);
  const workspaceName = workspace?.name ?? "this workspace";
  const accountExists = (await findUserIdByUsername(invite.email)) != null;
  return {
    status: accountExists ? "sign_in_required" : "create_account",
    email: invite.email,
    invitationId: invite.id,
    token,
    workspaceName,
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
      const linkState = await inviteLinkState(invitationId, token);
      if (linkState) {
        return routeData<LoaderData>(linkState, { headers });
      }
      return routeData<LoaderData>({ status: "not_signed_in" }, { headers });
    }

    const email = user.email?.toLowerCase().trim() ?? "";
    const invites = await loadPendingInvitationsByEmail(email);

    // Signed-in visitor landing on the emailed link: validate and offer redeem.
    if (invitationId && token) {
      const invite = await getWorkspaceInvitationById(invitationId);
      if (!invite || invite.status !== "pending") {
        return routeData<LoaderData>(
          {
            status: "invalid_link",
            error:
              "The invitation link is invalid or has expired. Please request a new invitation.",
          },
          { headers },
        );
      }
      if (invite.email.toLowerCase() !== email) {
        return routeData<LoaderData>(
          {
            status: "invalid_link",
            error:
              "The invitation link was sent to a different email address than the account you are signed in with.",
          },
          { headers },
        );
      }
      const workspace = await getWorkspaceById(invite.workspace_id);
      return routeData<LoaderData>(
        {
          status: "redeem_ready",
          workspaceName: workspace?.name ?? "this workspace",
          invitationId: invite.id,
          token,
          alreadyMember: false,
        },
        { headers },
      );
    }

    return routeData<LoaderData>(
      { status: "existing_user", invites, email },
      { headers },
    );
  },
});