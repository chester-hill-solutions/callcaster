import { data as routeData, redirect } from "react-router";
import { AuthzError } from "@chester-hill-solutions/auth";
import type { Database } from "@/lib/db-types";
import { env } from "@/lib/env.server";
import { isMemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import { assertSafeOutboundUrl } from "@/lib/safe-outbound-url.server";
import {
  inviteWorkspaceMember,
  inviteWorkspaceMemberAsPlatformAdmin,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "@/lib/platform-members.server";
import {
  deleteWorkspaceById,
  transferWorkspaceOwnership,
  upsertWorkspaceWebhookRow,
} from "@/lib/workspace-members-db.server";
import { cancelWorkspaceInvitationById } from "@/lib/workspace-invitations.server";

export type InviteActor =
  | { kind: "member"; userId: string }
  | { kind: "platform-admin" };

export async function handleAddUser(
  formData: FormData,
  workspaceId: string,
  headers: Headers,
  actor: InviteActor,
) {
  const username = formData.get("username") as string;
  const requestedRole = formData.get("new_user_workspace_role");
  if (!username) {
    return routeData({ user: null, error: "Must provide an email address" }, 400);
  }
  if (!isMemberRole(requestedRole)) {
    return routeData({ user: null, error: "Invalid workspace role" }, 400);
  }
  const cleanedName = username.toLowerCase().trim();

  const result =
    actor.kind === "platform-admin"
      ? await inviteWorkspaceMemberAsPlatformAdmin(workspaceId, cleanedName, requestedRole)
      : await inviteWorkspaceMember(actor.userId, workspaceId, cleanedName, requestedRole);

  if (!result.ok) {
    return routeData({ user: null, error: result.error }, { headers, status: result.status });
  }

  if ("warning" in result) {
    return routeData(
      { data: null, error: null, success: true, warning: result.warning },
      { headers },
    );
  }

  return routeData(
    { data: result.invite, error: null, success: true },
    { headers },
  );
}

export async function handleUpdateUser(
  formData: FormData,
  workspaceId: string,
  headers: Headers,
  actorUserId: string,
) {
  const userId = formData.get("user_id") as string;
  const updatedWorkspaceRole = formData.get("updated_workspace_role") as string;
  try {
    const result = await updateWorkspaceMemberRole(
      actorUserId,
      workspaceId,
      userId,
      updatedWorkspaceRole as "owner" | "member" | "caller" | "admin",
    );
    if (!result.ok) {
      return routeData(
        { data: null, error: result.error },
        { headers, status: result.status ?? 400 },
      );
    }
    return routeData({ data: result.member, error: null }, { headers });
  } catch (error) {
    return routeData(
      {
        data: null,
        error: error instanceof Error ? error.message : "Failed to update user",
      },
      { headers },
    );
  }
}

export async function handleDeleteUser(
  formData: FormData,
  workspaceId: string,
  headers: Headers,
  actorUserId: string,
) {
  const userId = formData.get("user_id") as string;
  try {
    const result = await removeWorkspaceMember(actorUserId, workspaceId, userId);
    if (!result.ok) {
      return routeData(
        { data: null, error: result.error },
        { headers, status: result.status ?? 400 },
      );
    }
    return routeData(
      { data: result.member, error: result.member ? null : "User not found" },
      { headers },
    );
  } catch (error) {
    return routeData(
      {
        data: null,
        error: error instanceof Error ? error.message : "Failed to delete user",
      },
      { headers },
    );
  }
}

export async function handleTransferWorkspace(
  formData: FormData,
  workspaceId: string,
  headers: Headers,
  currentOwnerUserId: string,
) {
  const newOwnerUserId = formData.get("user_id") as string;
  try {
    const { previousOwner } = await transferWorkspaceOwnership({
      workspaceId,
      currentOwnerUserId,
      newOwnerUserId,
    });
    return routeData({ data: previousOwner, error: null }, { headers });
  } catch (error) {
    return routeData(
      { error: error instanceof Error ? error.message : "Transfer failed" },
      { headers, status: 400 },
    );
  }
}

export async function handleDeleteWorkspace({
  workspaceId,
}: {
  workspaceId: string;
  headers: Headers;
}) {
  try {
    await deleteWorkspaceById(workspaceId);
    return redirect("/workspaces");
  } catch (deleteWorkspaceError) {
    logger.error("Error deleting workspace: ", deleteWorkspaceError);
    return {
      data: null,
      error: deleteWorkspaceError instanceof Error ? deleteWorkspaceError.message : deleteWorkspaceError,
    };
  }
}

export async function removeInvite({
  workspaceId,
  formData,
  headers,
}: {
  workspaceId: string;
  formData: FormData;
  headers: Headers;
}) {
  const invitationId = formData.get("userId") as string;
  try {
    await cancelWorkspaceInvitationById(invitationId, workspaceId);
    return { data: { invitationId }, error: null };
  } catch (error) {
    logger.error("Error removing invite: ", error);
    return routeData(
      {
        data: null,
        error: error instanceof AuthzError ? error.message : "Could not cancel the invitation.",
      },
      { headers, status: error instanceof AuthzError ? error.status : 500 },
    );
  }
}

export async function handleUpdateWebhook(
  formData: FormData,
  workspaceId: string,
  headers: Headers,
) {
  const webhookId = formData.get("webhookId") as string;
  const destinationUrl = formData.get("destinationUrl") as string;
  const userId = formData.get("userId") as string;
  const customHeaders = formData.get("customHeaders") as string;
  const events = formData.get("events") as string;

  const parsedEvents = JSON.parse(events) as string[];
  const headersArray = JSON.parse(customHeaders) as Array<[string, string]>;
  const custom_headers: Record<string, string> = {};
  headersArray.forEach(([key, value]) => {
    if (key) custom_headers[key] = value;
  });

  try {
    await assertSafeOutboundUrl(destinationUrl);
    const webhook = await upsertWorkspaceWebhookRow({
      workspaceId,
      userId,
      destinationUrl,
      customHeaders: custom_headers,
      events: parsedEvents,
      webhookId: webhookId ? Number.parseInt(webhookId, 10) : undefined,
    });
    return routeData({ data: webhook ? [webhook] : [], error: null }, { headers });
  } catch (webhookError) {
    logger.error("Error updating webhook", webhookError);
    return routeData(
      {
        data: null,
        error: webhookError instanceof Error ? webhookError.message : "Webhook update failed",
      },
      { headers },
    );
  }
}

export { testWebhook } from "@/lib/webhook-test-delivery.server";

export { sendWorkspaceWebhookNotification as sendWebhookNotification } from "@/lib/workspace-webhooks.server";
