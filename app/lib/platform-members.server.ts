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

  const { data: workspace, error } = await supabaseClient
    .from("workspace")
    .select(
      "workspace_users(role, user(id, username, first_name, last_name)), workspace_invite(*, user(id, username, first_name, last_name))",
    )
    .eq("id", workspaceId)
    .single();

  if (error) {
    logger.error("listWorkspaceMembers error", error);
    return { ok: false as const, error: error.message, status: 500 };
  }

  const members =
    workspace.workspace_users?.map((entry) => ({
      user_id: entry.user?.id ?? null,
      username: entry.user?.username ?? null,
      first_name: entry.user?.first_name ?? null,
      last_name: entry.user?.last_name ?? null,
      role: entry.role,
    })) ?? [];

  return {
    ok: true as const,
    members,
    pending_invites: workspace.workspace_invite ?? [],
  };
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
  const existingMember = users?.find((user) => user.username === cleanedEmail);
  if (existingMember) {
    return {
      ok: false as const,
      error: "This user is already an agent in the workspace.",
      status: 403,
    };
  }

  const { data: existingUser } = await supabaseClient
    .from("user")
    .select("id")
    .eq("username", cleanedEmail)
    .maybeSingle();

  if (existingUser?.id) {
    const { data: pendingInvite } = await supabaseClient
      .from("workspace_invite")
      .select("id")
      .eq("workspace", workspaceId)
      .eq("user_id", existingUser.id)
      .maybeSingle();

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
    if (existingUser?.id) {
      const { data: pendingInvite } = await supabaseClient
        .from("workspace_invite")
        .select("id")
        .eq("workspace", workspaceId)
        .eq("user_id", existingUser.id)
        .maybeSingle();
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

  const { data, error } = await supabaseClient
    .from("workspace_users")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUserId)
    .select()
    .single();

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, member: data };
}

export async function removeWorkspaceMember(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  targetUserId: string,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  const { data, error } = await supabaseClient
    .from("workspace_users")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUserId)
    .select()
    .single();

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, member: data };
}

export async function cancelWorkspaceInvite(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  inviteUserId: string,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  const { data, error } = await supabaseClient
    .from("workspace_invite")
    .delete()
    .eq("workspace", workspaceId)
    .eq("user_id", inviteUserId)
    .select();

  if (error) {
    logger.error("cancelWorkspaceInvite error", error);
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, invites: data };
}

export async function getWorkspaceWebhook(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  const { data, error } = await supabaseClient
    .from("webhook")
    .select("*")
    .eq("workspace", workspaceId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, webhook: data };
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

  const custom_headers = normalizeCustomHeaders(input.custom_headers);
  const updateData: Database["public"]["Tables"]["webhook"]["Insert"] = {
    destination_url: input.destination_url,
    updated_at: new Date().toISOString(),
    updated_by: userId,
    custom_headers,
    event: input.events,
    workspace: workspaceId,
  };

  if (input.webhook_id !== undefined) {
    updateData.id = input.webhook_id;
  }

  const { data, error } = await supabaseClient
    .from("webhook")
    .upsert(updateData)
    .select()
    .single();

  if (error) {
    logger.error("upsertWorkspaceWebhook error", error);
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, webhook: data };
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

  const { data: keys, error } = await supabaseClient
    .from("workspace_api_key")
    .select("id, name, key_prefix, created_at, last_used_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("listWorkspaceApiKeys error", error);
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, keys: keys ?? [] };
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

  const { data: row, error } = await supabaseClient
    .from("workspace_api_key")
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      key_prefix: keyPrefix,
      key_hash: keyHash,
      created_by: userId,
    })
    .select("id, name, key_prefix, created_at")
    .single();

  if (error) {
    logger.error("createWorkspaceApiKey error", error);
    return { ok: false as const, error: error.message, status: 500 };
  }

  return {
    ok: true as const,
    key,
    api_key: row,
  };
}

export async function deleteWorkspaceApiKey(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  keyId: string,
) {
  const access = await requireMemberManager(supabaseClient, userId, workspaceId);
  if (!access.ok) return access;

  const { error } = await supabaseClient
    .from("workspace_api_key")
    .delete()
    .eq("id", keyId)
    .eq("workspace_id", workspaceId);

  if (error) {
    logger.error("deleteWorkspaceApiKey error", error);
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const };
}
