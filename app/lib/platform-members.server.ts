import { randomBytes } from "crypto";
import {
  API_KEY_PREFIX_LENGTH,
  hashApiKeyForStorage,
} from "@/lib/api-auth.server";
import {
  API_KEY_DEFAULT_TTL_DAYS,
  API_KEY_MAX_TTL_DAYS,
  capabilityIdsForRole,
  isProductCapabilityId,
  type ProductCapabilityId,
} from "@/lib/capabilities";
import {
  getUserRole,
  getWorkspaceUsers,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import type { Database } from "@/lib/db-types";
import { logger } from "@/lib/logger.server";
import { hasMinRole, MemberRole } from "@/lib/member-role";
import { WORKSPACE_ROLE_RANK } from "@/lib/workspace-route.server";
import { requireTwoFactorForPrivilegedRoleAssignment } from "@/lib/two-factor.server";
import { safeRecordWorkspaceAuditEvent } from "@/lib/audit-event.server";
import { assertSafeOutboundUrl, safeOutboundFetch } from "@/lib/safe-outbound-url.server";
import { env } from "@/lib/env.server";
import { inviteUserByEmail } from "@/lib/invite-user-by-email.server";
import type {
  upsertWebhookBodySchema,
} from "@/lib/schemas/api/platform-workspace-admin";
import {
  deleteWorkspaceApiKeyRow,
  findUserIdByUsername,
  findWorkspaceInviteForUser,
  findWorkspaceMembership,
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

const KEY_PREFIX = "cc_live_";
const KEY_PREFIX_RANDOM_LENGTH = 16;
const KEY_SECRET_LENGTH = 48;

type UpsertWebhookInput = z.infer<typeof upsertWebhookBodySchema>;

async function requireMemberManager(
  userId: string,
  workspaceId: string,
): Promise<
  | { ok: true; actorRole: string }
  | { ok: false; error: string; status: number }
> {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const userRole = await getUserRole({
    user: { id: userId },
    workspaceId,
  });

  if (!userRole || userRole.role === MemberRole.Caller) {
    return { ok: false, error: "Not authorized", status: 403 };
  }

  return { ok: true, actorRole: userRole.role };
}

/**
 * API keys are a stricter class of artifact than member management. A key is a
 * durable, workspace-scoped bearer credential: `apiKeyActorFromScopes` builds
 * its capability set from the stored scopes alone and never re-checks the
 * minter's current role, so a key outlives the membership that created it (up
 * to `API_KEY_MAX_TTL_DAYS`). Demoting or removing the minter does not weaken
 * the key. That durability is why minting sits at admin, above the member floor
 * `requireMemberManager` establishes for member management — and it matches the
 * `workspaceAdmin` authClass this route has always declared in the API surface.
 */
async function requireApiKeyManager(
  userId: string,
  workspaceId: string,
): Promise<
  | { ok: true; actorRole: string }
  | { ok: false; error: string; status: number }
> {
  const access = await requireMemberManager(userId, workspaceId);
  if (!access.ok) return access;

  if (!hasMinRole(access.actorRole, MemberRole.Admin)) {
    return {
      ok: false,
      error: "Workspace admin role required to manage API keys",
      status: 403,
    };
  }

  return { ok: true, actorRole: access.actorRole };
}

/**
 * Cap the mintable capability set at the intersection of the minter's own role
 * capabilities: a key may never carry a capability its creator does not hold.
 * Without this, the role→capability matrix is advisory — an actor could mint a
 * key granting powers their own role is denied and then present that key on
 * capability-gated Data Plane routes, laundering the role gate into a scope
 * they chose themselves. Applies at mint time; scopes are immutable afterwards
 * (there is no update path), so this is the only place the cap is needed.
 */
function assertScopesWithinActorRole(
  actorRole: string,
  scopes: readonly ProductCapabilityId[],
): { ok: true } | { ok: false; error: string; status: number } {
  const granted = new Set<string>(capabilityIdsForRole(actorRole));
  const disallowed = scopes.filter((scope) => !granted.has(scope));

  if (disallowed.length > 0) {
    return {
      ok: false,
      error:
        `Your role (${actorRole}) cannot grant these capability scopes: ` +
        `${disallowed.join(", ")}. An API key may only carry capabilities its creator holds.`,
      status: 403,
    };
  }

  return { ok: true };
}

/**
 * Prevent privilege escalation: an actor may never grant a role that outranks
 * their own. Without this, a `member` (who can manage members) could promote
 * themselves or anyone to `admin`/`owner`. Applies to both role edits and
 * invites.
 */
function assertNoRoleEscalation(
  actorRole: string,
  assignedRole: string,
): { ok: true } | { ok: false; error: string; status: number } {
  const actorRank = WORKSPACE_ROLE_RANK[actorRole] ?? 0;
  const assignedRank = WORKSPACE_ROLE_RANK[assignedRole] ?? 0;
  if (assignedRank > actorRank) {
    return {
      ok: false,
      error: "You cannot grant a role higher than your own.",
      status: 403,
    };
  }
  return { ok: true };
}

/**
 * An actor may only manage (demote or remove) a member whose current rank is
 * at or below the actor's own. Without this, `requireMemberManager` alone lets
 * a `member` remove or demote an `admin`: the escalation guards only inspect
 * the *assigned* role, never the target's *existing* rank. Actor-at-or-above
 * (rather than strictly-above) preserves peer management and self-service while
 * closing the escalation.
 */
async function requireActorOutranksTarget(
  actorRole: string,
  workspaceId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const targetMembership = await findWorkspaceMembership(workspaceId, targetUserId);
  if (!targetMembership) {
    return { ok: false, error: "Member not found", status: 404 };
  }

  const actorRank = WORKSPACE_ROLE_RANK[actorRole] ?? 0;
  const targetRank = WORKSPACE_ROLE_RANK[targetMembership.role] ?? 0;
  if (actorRank < targetRank) {
    return {
      ok: false,
      error: "You cannot manage a member who outranks you.",
      status: 403,
    };
  }

  return { ok: true };
}

async function getWorkspaceOwners(workspaceId: string) {
  const members = await listWorkspaceMembersEnriched(workspaceId);
  return members.filter((member) => member.role === MemberRole.Owner);
}

async function requireOwnerForOwnerChange(
  actorUserId: string,
  workspaceId: string,
  targetUserId: string,
  newRole?: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const targetMembership = await findWorkspaceMembership(workspaceId, targetUserId);
  if (!targetMembership) {
    return { ok: false, error: "Member not found", status: 404 };
  }

  const isOwnerChange =
    newRole === MemberRole.Owner || targetMembership.role === MemberRole.Owner;
  if (!isOwnerChange) {
    return { ok: true };
  }

  const actorMembership = await findWorkspaceMembership(workspaceId, actorUserId);
  if (actorMembership?.role !== MemberRole.Owner) {
    return { ok: false, error: "Only workspace owners can change owner roles", status: 403 };
  }

  return { ok: true };
}

async function requireSoleOwnerProtection(
  workspaceId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const targetMembership = await findWorkspaceMembership(workspaceId, targetUserId);
  if (targetMembership?.role !== MemberRole.Owner) {
    return { ok: true };
  }

  const owners = await getWorkspaceOwners(workspaceId);
  if (owners.length <= 1) {
    return { ok: false, error: "Cannot remove the sole owner", status: 403 };
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
  const prefixPart = secret.slice(0, KEY_PREFIX_RANDOM_LENGTH);
  const restPart = secret.slice(KEY_PREFIX_RANDOM_LENGTH);
  const key = `${KEY_PREFIX}${prefixPart}_${restPart}`;
  const keyPrefix = `${KEY_PREFIX}${prefixPart}`;
  const keyHash = hashApiKeyForStorage(key);
  return { key, keyPrefix, keyHash };
}

export async function listWorkspaceMembers(
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
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

async function inviteWorkspaceMemberWithActorRole(
  actorRole: string,
  workspaceId: string,
  email: string,
  role: "owner" | "admin" | "member" | "caller",
) {
  const escalation = assertNoRoleEscalation(actorRole, role);
  if (!escalation.ok) return escalation;

  const cleanedEmail = email.toLowerCase().trim();
  const { data: users } = await getWorkspaceUsers({
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

  const result = await inviteUserByEmail({
    workspaceId,
    email: cleanedEmail,
    role,
  });

  if (!result.ok) {
    return { ok: false as const, error: result.error, status: 400 };
  }

  return { ok: true as const, invite: result.invite };
}

export async function inviteWorkspaceMember(
  userId: string,
  workspaceId: string,
  email: string,
  role: "owner" | "admin" | "member" | "caller",
) {
  const access = await requireMemberManager(userId, workspaceId);
  if (!access.ok) return access;

  return inviteWorkspaceMemberWithActorRole(
    access.actorRole,
    workspaceId,
    email,
    role,
  );
}

/**
 * Invite via API key with `members.invite`. Role assignment follows the admin
 * subordination policy (member/caller only) until members.assign.* scopes exist.
 */
export async function inviteWorkspaceMemberAsApiKey(
  workspaceId: string,
  email: string,
  role: "owner" | "admin" | "member" | "caller",
) {
  // Actor rank `member`, not `admin`: a `members.invite` key must not be able to
  // mint an `admin`/`owner` invite. assertNoRoleEscalation blocks anything above
  // `member`, matching this function's member/caller-only policy.
  return inviteWorkspaceMemberWithActorRole("member", workspaceId, email, role);
}

export async function updateWorkspaceMemberRole(
  userId: string,
  workspaceId: string,
  targetUserId: string,
  role: "owner" | "admin" | "member" | "caller",
) {
  const access = await requireMemberManager(userId, workspaceId);
  if (!access.ok) return access;

  // Owner-role transitions keep their specific owner-only gate first.
  const ownerCheck = await requireOwnerForOwnerChange(userId, workspaceId, targetUserId, role);
  if (!ownerCheck.ok) return ownerCheck;

  // The actor must at least match the target's current rank, or a `member`
  // could demote an `admin` (the owner gate above only covers owner targets).
  const rankCheck = await requireActorOutranksTarget(access.actorRole, workspaceId, targetUserId);
  if (!rankCheck.ok) return rankCheck;

  // No privilege escalation: an actor cannot grant a role above their own.
  // This is what stops a `member` (who may manage members) from promoting
  // themselves or anyone to `admin`.
  const escalation = assertNoRoleEscalation(access.actorRole, role);
  if (!escalation.ok) return escalation;

  const soleOwnerCheck = await requireSoleOwnerProtection(workspaceId, targetUserId);
  if (!soleOwnerCheck.ok) return soleOwnerCheck;

  const mfaCheck = await requireTwoFactorForPrivilegedRoleAssignment(targetUserId, role);
  if (!mfaCheck.ok) return mfaCheck;

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
  userId: string,
  workspaceId: string,
  targetUserId: string,
) {
  const access = await requireMemberManager(userId, workspaceId);
  if (!access.ok) return access;

  const ownerCheck = await requireOwnerForOwnerChange(userId, workspaceId, targetUserId);
  if (!ownerCheck.ok) return ownerCheck;

  // The actor must at least match the target's current rank, or a `member`
  // could remove an `admin` (the owner gate above only covers owner targets).
  const rankCheck = await requireActorOutranksTarget(access.actorRole, workspaceId, targetUserId);
  if (!rankCheck.ok) return rankCheck;

  const soleOwnerCheck = await requireSoleOwnerProtection(workspaceId, targetUserId);
  if (!soleOwnerCheck.ok) return soleOwnerCheck;

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
  userId: string,
  workspaceId: string,
  inviteUserId: string,
) {
  const access = await requireMemberManager(userId, workspaceId);
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
  userId: string,
  workspaceId: string,
) {
  const access = await requireMemberManager(userId, workspaceId);
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
  userId: string,
  workspaceId: string,
  input: UpsertWebhookInput,
) {
  const access = await requireMemberManager(userId, workspaceId);
  if (!access.ok) return access;

  try {
    await assertSafeOutboundUrl(input.destination_url);
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
    await assertSafeOutboundUrl(destinationUrl);
  } catch (urlError) {
    const message =
      urlError instanceof Error ? urlError.message : "Destination URL is not allowed";
    return { ok: false as const, error: message, status: 400 };
  }

  const headersObject = normalizeCustomHeaders(customHeaders);

  try {
    const response = await safeOutboundFetch(destinationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headersObject,
      },
      body: JSON.stringify(testData),
      signal: AbortSignal.timeout(10000),
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
  userId: string,
  workspaceId: string,
) {
  const access = await requireApiKeyManager(userId, workspaceId);
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
  userId: string,
  workspaceId: string,
  name: string,
  scopes: readonly string[],
  expiresInDays: number = API_KEY_DEFAULT_TTL_DAYS,
) {
  const access = await requireApiKeyManager(userId, workspaceId);
  if (!access.ok) return access;

  const normalizedScopes = [
    ...new Set(scopes.map((s) => s.trim()).filter(Boolean)),
  ];
  if (normalizedScopes.length === 0) {
    return {
      ok: false as const,
      error: "At least one capability scope is required",
      status: 400,
    };
  }
  const invalid = normalizedScopes.filter((s) => !isProductCapabilityId(s));
  if (invalid.length > 0) {
    return {
      ok: false as const,
      error: `Unknown capability scopes: ${invalid.join(", ")}`,
      status: 400,
    };
  }

  // Unknown scopes are a client error (400) and are rejected above; scopes that
  // are real but outrank the minter are an authorization failure (403).
  const withinRole = assertScopesWithinActorRole(
    access.actorRole,
    normalizedScopes as ProductCapabilityId[],
  );
  if (!withinRole.ok) {
    await safeRecordWorkspaceAuditEvent({
      workspaceId,
      actorType: "session",
      actorId: userId,
      action: "api_keys.create",
      targetType: "api_key",
      outcome: "denied",
      metadata: {
        reason: "scope_exceeds_role",
        actor_role: access.actorRole,
        requested_scopes: normalizedScopes,
      },
    });
    return { ok: false as const, error: withinRole.error, status: withinRole.status };
  }

  const ttlDays = Number.isFinite(expiresInDays)
    ? Math.trunc(expiresInDays)
    : API_KEY_DEFAULT_TTL_DAYS;
  if (ttlDays < 1 || ttlDays > API_KEY_MAX_TTL_DAYS) {
    return {
      ok: false as const,
      error: `expires_in_days must be between 1 and ${API_KEY_MAX_TTL_DAYS}`,
      status: 400,
    };
  }

  const { key, keyPrefix, keyHash } = generateApiKey();
  const expiresAt = new Date(
    Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    const row = await insertWorkspaceApiKeyRow({
      workspaceId,
      userId,
      name,
      keyPrefix,
      keyHash,
      scopes: normalizedScopes as ProductCapabilityId[],
      expiresAt,
    });
    if (!row) {
      return { ok: false as const, error: "Failed to create API key", status: 500 };
    }

    await safeRecordWorkspaceAuditEvent({
      workspaceId,
      actorType: "session",
      actorId: userId,
      action: "api_keys.create",
      targetType: "api_key",
      targetId: String(row.id),
      outcome: "success",
      metadata: {
        name: row.name,
        key_prefix: row.key_prefix,
        scopes: normalizedScopes,
        expires_at: expiresAt,
      },
    });

    return {
      ok: true as const,
      key,
      api_key: {
        id: row.id,
        name: row.name,
        key_prefix: row.key_prefix,
        created_at: row.created_at,
        scopes: row.scopes ?? normalizedScopes,
        expires_at: row.expires_at ?? expiresAt,
      },
    };
  } catch (error) {
    logger.error("createWorkspaceApiKey error", error);
    // DrizzleQueryError message is only "Failed query: … params: …"; the Postgres
    // detail (missing column, FK, unique) lives on `.cause`.
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : null;
    const message =
      cause ??
      (error instanceof Error ? error.message : "Failed to create API key");
    return {
      ok: false as const,
      error: message,
      status: 500,
    };
  }
}

export async function deleteWorkspaceApiKey(
  userId: string,
  workspaceId: string,
  keyId: string,
) {
  const access = await requireApiKeyManager(userId, workspaceId);
  if (!access.ok) return access;

  try {
    await deleteWorkspaceApiKeyRow({ workspaceId, keyId });
    await safeRecordWorkspaceAuditEvent({
      workspaceId,
      actorType: "session",
      actorId: userId,
      action: "api_keys.delete",
      targetType: "api_key",
      targetId: keyId,
      outcome: "success",
    });
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
