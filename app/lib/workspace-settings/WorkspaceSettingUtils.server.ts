import { data as routeData, redirect } from "react-router";
import type { Database } from "@/lib/db-types";
import { getWorkspaceUsers } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import {
  deleteWorkspaceById,
  findUserIdByUsername,
  findWorkspaceInviteForUser,
  removeWorkspaceInviteForUser,
  removeWorkspaceMember,
  transferWorkspaceOwnership,
  updateWorkspaceMemberRole,
  upsertWorkspaceWebhookRow,
} from "@/lib/workspace-members-db.server";

export async function handleAddUser(
  formData: FormData,
  workspaceId: string,
  headers: Headers,
) {
  const username = formData.get("username") as string;
  const newUserRole = formData.get("new_user_workspace_role") as string;
  if (!username) {
    return routeData({ user: null, error: "Must provide an email address" }, 400);
  }
  const cleanedName = username.toLowerCase().trim();
  const { data: users } = await getWorkspaceUsers({
    workspaceId,
  });
  const match = users?.filter((user) => {
    return user.username === cleanedName;
  });
  if (match?.length) {
    return routeData({ user: null, error: "This user is already an agent in the workspace." }, 403);
  }

  const existingUserId = await findUserIdByUsername(cleanedName);

  if (existingUserId) {
    const pendingInvite = await findWorkspaceInviteForUser(workspaceId, existingUserId);
    if (pendingInvite) {
      return routeData(
        {
          data: null,
          error: null,
          success: true,
          warning: "An invite is already pending for this email.",
        },
        { headers },
      );
    }
  }

  const { data: user, error: inviteUserError } =
    await (null as any).functions.invoke("invite-user-by-email", {
      body: {
        workspaceId,
        email: cleanedName,
        role: newUserRole,
      },
    });
  if (inviteUserError) {
    if (existingUserId) {
      const pendingInvite = await findWorkspaceInviteForUser(workspaceId, existingUserId);
      if (pendingInvite) {
        return routeData(
          {
            data: user,
            error: null,
            success: true,
            warning: "Invite was created but email delivery may have failed.",
          },
          { headers },
        );
      }
    }
    return routeData({ user: null, error: inviteUserError.message }, { headers });
  }
  return routeData({ data: user, error: null, success: true }, { headers });
}

export async function handleUpdateUser(
  formData: FormData,
  workspaceId: string,
  headers: Headers,
) {
  const userId = formData.get("user_id") as string;
  const updatedWorkspaceRole = formData.get("updated_workspace_role") as string;
  try {
    const updatedUser = await updateWorkspaceMemberRole({
      workspaceId,
      userId,
      role: updatedWorkspaceRole as "owner" | "member" | "caller" | "admin",
    });
    return routeData({ data: updatedUser, error: null }, { headers });
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
) {
  const userId = formData.get("user_id") as string;
  try {
    const deletedUser = await removeWorkspaceMember({ workspaceId, userId });
    return routeData(
      { data: deletedUser, error: deletedUser ? null : "User not found" },
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

export async function handleDeleteSelf(
  formData: FormData,
  workspaceId: string,
  headers: Headers,
) {
  const userId = formData.get("user_id") as string;
  if (userId == null) {
    return routeData({ error: `User ${userId} not found` }, { headers });
  }

  try {
    await removeWorkspaceMember({ workspaceId, userId });
    return redirect("/workspaces", { headers });
  } catch (errorDeletingSelf) {
    logger.error("Error deleting current user from workspace", errorDeletingSelf);
    return {
      data: null,
      error: errorDeletingSelf instanceof Error ? errorDeletingSelf.message : "Delete failed",
    };
  }
}

export async function handleTransferWorkspace(
  formData: FormData,
  workspaceId: string,
  headers: Headers,
) {
  const currentOwnerUserId = formData.get("workspace_owner_id") as string;
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
      { headers },
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
}: {
  workspaceId: string;
  formData: FormData;
  headers: Headers;
}) {
  const userId = formData.get("userId") as string;
  try {
    const data = await removeWorkspaceInviteForUser({ workspaceId, userId });
    return { data, error: null };
  } catch (error) {
    logger.error("Error removing invite: ", error);
    return { data: null, error };
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

export async function testWebhook(
  testData: string | Record<string, unknown>,
  destination_url: string,
  custom_headers: string | Record<string, string>,
) {
  try {
    const parsedTestData = typeof testData === "string" ? JSON.parse(testData) : testData;
    const parsedHeaders =
      typeof custom_headers === "string" ? JSON.parse(custom_headers) : custom_headers;

    const headersObject: Record<string, string> = {};
    if (Array.isArray(parsedHeaders)) {
      parsedHeaders.forEach(([key, value]: [string, string]) => {
        if (key) headersObject[key] = value;
      });
    } else {
      Object.assign(headersObject, parsedHeaders);
    }

    const response = await fetch(destination_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headersObject,
      },
      body: JSON.stringify(parsedTestData),
    });

    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      error: null,
    };
  } catch (error: unknown) {
    logger.error("Error sending test data", error);
    return {
      data: null,
      status: 500,
      statusText: "Error sending webhook",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export { sendWorkspaceWebhookNotification as sendWebhookNotification } from "@/lib/workspace-webhooks.server";
