import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  API_KEY_PREFIX_LENGTH,
  hashApiKeyForStorage,
} from "@/lib/api-auth.server";
import { getUserRole, getWorkspaceUsers, requireWorkspaceAccess } from "@/lib/database.server";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";
import { MemberRole } from "@/lib/member-role";
import { assertSafeOutboundUrl } from "@/lib/safe-outbound-url.server";
import type {
  upsertWebhookBodySchema,
} from "@/lib/schemas/api/platform-workspace-admin";
import {
  deleteWorkspaceApiKeyRow,
  findUserIdByUsername,
  findWorkspaceInviteForUser,
  getWorkspaceWebhookRow,
  insertWorkspaceApiKeyRow,
  listWorkspaceApiKeyRows,
  listWorkspaceInvitesEnriched,
  listWorkspaceMembersEnriched,
  removeWorkspaceInviteForUser,
  removeWorkspaceMember as removeWorkspaceMemberRow,
  updateWorkspaceMemberRole as updateWorkspaceMemberRoleRow,
  upsertWorkspaceWebhookRow,
} from "@/lib/workspace-members-db.server";
import type { z } from "zod";

const KEY_SECRET_LENGTH = 32;
const KEY_PREFIX = "cc_live_";

type UpsertWebhookInput = z.infer<typeof upsertWebhookBodySchema>;

async function requireMemberManager(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const userRole = await getUserRole({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  if (!userRole || userRole.role === MemberRole.Caller) {
    return { ok: false, error: "Not authorized", status: 403 };
  }

  return { ok: true };
}

function normalizeCustomHeaders(
  customHeaders: UpsertWebhookInput["custom_headers"],
): Record<string, string> {
  const result: Record<string, string> = {};
  if (Array.isArray(customHeaders)) {
    customHeaders.forEach(([key, value]) => {
      if (key) result[key] = value;
    });
  } else {
    Object.assign(result, customHeaders);
  }
  return result;
}

function generateApiKey(): { key: string; keyPrefix: string; keyHash: string } {
  const secret = randomBytes(KEY_SECRET_LENGTH).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  const keyPrefix = key.slice(0, API_KEY_PREFIX_LENGTH);
  const keyHash = hashApiKeyForStorage(key);
  return { key, keyPrefix, keyHash };
}

export async function listWorkspaceMembers(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  try {
    const [members, pending_invites] = await Promise.all([
      listWorkspaceMembersEnriched(workspaceId),
      listWorkspaceInvitesEnriched(workspaceId),
    ]);

    return {
      ok: true as const,
      members,
      pending_invites,
    };
  } catch (error) {
    logger.error("listWorkspaceMembers error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load members",
      status: 500,
    };
  }
}

export async function inviteWorkspaceMember(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  email: string,
  role: "owner" | "admin" | "member" | "caller",
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  const cleanedEmail = email.toLowerCase().trim();
  const { data: users } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });
  const existingMember = users?.find((user: { username?: string | null }) => user.username === cleanedEmail);
  if (existingMember) {
    return {
      ok: false as const,
      error: "This user is already an agent in the workspace.",
      status: 403,
    };
  }

  const existingUserId = await findUserIdByUsername(cleanedEmail);

  if (existingUserId) {
    const pendingInvite = await findWorkspaceInviteForUser(workspaceId, existingUserId);
    if (pendingInvite) {
      return {
        ok: true as const,
        warning: "An invite is already pending for this email.",
      };
    }
  }

  const { data: inviteData, error: inviteUserError } =
    await supabaseClient.functions.invoke("invite-user-by-email", {
      body: {
        workspaceId,
        email: cleanedEmail,
        role,
      },
    });

  if (inviteUserError) {
    if (existingUserId) {
      const pendingInvite = await findWorkspaceInviteForUser(workspaceId, existingUserId);
      if (pendingInvite) {
        return {
          ok: true as const,
          invite: inviteData,
          warning: "Invite was created but email delivery may have failed.",
        };
      }
    }
    return { ok: false as const, error: inviteUserError.message, status: 400 };
  }

  return { ok: true as const, invite: inviteData };
}

export async function updateWorkspaceMemberRole(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  targetUserId: string,
  role: "owner" | "admin" | "member" | "caller",
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  try {
    const data = await updateWorkspaceMemberRoleRow({
      workspaceId,
      userId: targetUserId,
      role,
    });
    if (!data) {
      return { ok: false as const, error: "Member not found", status: 404 };
    }
    return { ok: true as const, member: data };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to update member",
      status: 500,
    };
  }
}

export async function removeWorkspaceMember(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  targetUserId: string,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  try {
    const data = await removeWorkspaceMemberRow({
      workspaceId,
      userId: targetUserId,
    });
    if (!data) {
      return { ok: false as const, error: "Member not found", status: 404 };
    }
    return { ok: true as const, member: data };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to remove member",
      status: 500,
    };
  }
}

export async function cancelWorkspaceInvite(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  inviteUserId: string,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  try {
    const data = await removeWorkspaceInviteForUser({
      workspaceId,
      userId: inviteUserId,
    });
    return { ok: true as const, invites: data };
  } catch (error) {
    logger.error("cancelWorkspaceInvite error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to cancel invite",
      status: 500,
    };
  }
}

export async function getWorkspaceWebhook(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  try {
    const data = await getWorkspaceWebhookRow(workspaceId);
    return { ok: true as const, webhook: data ?? null };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load webhook",
      status: 500,
    };
  }
}

export async function upsertWorkspaceWebhook(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  input: UpsertWebhookInput,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  try {
    assertSafeOutboundUrl(input.destination_url);
  } catch (urlError) {
    const message =
      urlError instanceof Error ? urlError.message : "Destination URL is not allowed";
    return { ok: false as const, error: message, status: 400 };
  }

  try {
    const data = await upsertWorkspaceWebhookRow({
      workspaceId,
      userId,
      destinationUrl: input.destination_url,
      customHeaders: normalizeCustomHeaders(input.custom_headers),
      events: input.events,
      webhookId: input.webhook_id,
    });
    if (!data) {
      return { ok: false as const, error: "Failed to save webhook", status: 500 };
    }
    return { ok: true as const, webhook: data };
  } catch (error) {
    logger.error("upsertWorkspaceWebhook error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to save webhook",
      status: 500,
    };
  }
}

export async function testWorkspaceWebhook(
  destinationUrl: string,
  customHeaders: Record<string, string> | Array<[string, string]>,
  testData: Record<string, unknown>,
) {
  try {
    assertSafeOutboundUrl(destinationUrl);
  } catch (urlError) {
    const message =
      urlError instanceof Error ? urlError.message : "Destination URL is not allowed";
    return { ok: false as const, error: message, status: 400 };
  }

  const headersObject = normalizeCustomHeaders(customHeaders);

  try {
    const response = await fetch(destinationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headersObject,
      },
      body: JSON.stringify(testData),
    });

    let data: unknown;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      ok: true as const,
      data,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error: unknown) {
    logger.error("testWorkspaceWebhook error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
      status: 500,
    };
  }
}

export async function listWorkspaceApiKeys(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  try {
    const keys = await listWorkspaceApiKeyRows(workspaceId);
    return { ok: true as const, keys };
  } catch (error) {
    logger.error("listWorkspaceApiKeys error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to list API keys",
      status: 500,
    };
  }
}

export async function createWorkspaceApiKey(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  name: string,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  const { key, keyPrefix, keyHash } = generateApiKey();

  try {
    const row = await insertWorkspaceApiKeyRow({
      workspaceId,
      userId,
      name,
      keyPrefix,
      keyHash,
    });
    if (!row) {
      return { ok: false as const, error: "Failed to create API key", status: 500 };
    }

    return {
      ok: true as const,
      key,
      api_key: {
        id: row.id,
        name: row.name,
        key_prefix: row.key_prefix,
        created_at: row.created_at,
      },
    };
  } catch (error) {
    logger.error("createWorkspaceApiKey error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to create API key",
      status: 500,
    };
  }
}

export async function deleteWorkspaceApiKey(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  keyId: string,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  try {
    await deleteWorkspaceApiKeyRow({ workspaceId, keyId });
    return { ok: true as const };
  } catch (error) {
    logger.error("deleteWorkspaceApiKey error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to delete API key",
      status: 500,
    };
  }
}
