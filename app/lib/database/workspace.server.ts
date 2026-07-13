/**
 * Workspace-related database functions
 */
import Twilio from "twilio";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  audience,
  campaign,
  workspace,
  workspace_invite,
  workspace_member,
  workspace_number,
} from "@/db/schema";
import { eqChsTextToUuid } from "@/lib/chs-uuid-text.server";
import { WorkspaceData, WorkspaceNumbers } from "../types";
import { NewKeyInstance } from "twilio/lib/rest/api/v2010/account/newKey";
import { MemberRole } from "@/components/workspace/TeamMember";
import { env } from "../env.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import {
  getWorkspaceTwilioDataVersion,
  invalidateWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import { logger } from "../logger.server";
import {
  rpcCreateNewWorkspace,
  rpcGetWorkspaceUsers,
  rpcUpdateUserWorkspaceLastAccessTime,
} from "@/lib/db-rpc.server";
import { createStripeContact } from "./stripe.server";
import {
  buildOnboardingStepsForState,
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  getWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { seedWorkspaceSampleData } from "@/lib/seed/seed-workspace-sample-data.server";
import { adminDb } from "@/server/admin-db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { data as routeData } from "react-router";
import { auth } from "@/server/auth-instance";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import {
  addUserToWorkspace,
  getUserRole,
  memberRoleToRoleId,
  requireWorkspaceAccess,
  workspaceMemberId,
} from "@/lib/workspace-membership.server";

export {
  addUserToWorkspace,
  getUserRole,
  memberRoleToRoleId,
  requireWorkspaceAccess,
  workspaceMemberId,
};

type DbQueryError = { message: string; code?: string; details?: string };

function toDbError(error: unknown): DbQueryError {
  if (error instanceof Error) {
    return { message: error.message, details: error.message };
  }
  return { message: String(error) };
}

function parseTwilioDataColumn(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function notFoundError(message = "Row not found"): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = "PGRST116";
  return err;
}

export {
  normalizeWorkspaceTwilioOpsConfig,
  getWorkspaceTwilioPortalConfigFromTwilioData,
  getEffectiveWorkspaceTwilioPortalConfig,
  normalizeWorkspaceTwilioSyncSnapshot,
  getWorkspaceTwilioSyncSnapshotFromTwilioData,
  getWorkspaceTwilioPortalConfig,
  updateWorkspaceTwilioPortalConfig,
  updateWorkspaceTwilioSyncSnapshot,
  syncWorkspaceTwilioSnapshot,
  buildDefaultWorkspaceTwilioPortalSnapshot,
  getWorkspaceTwilioPortalSnapshot,
} from "./workspace-twilio.server";

export async function getUserWorkspaces({ userId }: { userId: string }) {
  if (!userId) {
    return { data: null, error: "No user session found" };
  }

  try {
    const rows = await adminDb
      .select({ workspace })
      .from(workspace_member)
      .innerJoin(
        workspace,
        eqChsTextToUuid(workspace_member.workspace_id, workspace.id),
      )
      .where(eq(workspace_member.user_id, userId))
      .orderBy(desc(workspace.created_at));

    const data = rows.map((row) => row.workspace) as WorkspaceData;
    return { data, error: null };
  } catch (error) {
    logger.error("Error on function getUserWorkspaces: ", error);
    return { data: null, error: toDbError(error) };
  }
}

export async function createKeys({
  workspace_id,
  sid,
  token,
}: {
  workspace_id: string;
  sid: string;
  token: string;
}): Promise<NewKeyInstance> {
  const twilio = new Twilio.Twilio(sid, token);
  try {
    const newKey = await twilio.newKeys.create({ friendlyName: workspace_id });
    return newKey;
  } catch (error) {
    logger.error("Error creating keys", error);
    throw error;
  }
}

export async function createSubaccount({
  workspace_id,
}: {
  workspace_id: string;
}) {
  const twilio = new Twilio.Twilio(env.TWILIO_SID(), env.TWILIO_AUTH_TOKEN());
  const account = await twilio.api.v2010.accounts
    .create({
      friendlyName: workspace_id,
    })
    .catch((error) => {
      logger.error("Error creating subaccount", error);
    });
  return account;
}

/** Twilio `AccountInstance` is not JSON-serializable (circular `_version`); tests may return plain objects without `toJSON`. */
function twilioAccountToPersistableJson(account: unknown): Record<string, unknown> {
  if (
    typeof account === "object" &&
    account !== null &&
    "toJSON" in account &&
    typeof (account as { toJSON?: unknown }).toJSON === "function"
  ) {
    const plain = (account as { toJSON: () => object }).toJSON();
    return { ...(plain as Record<string, unknown>) };
  }
  if (typeof account !== "object" || account === null) {
    return {};
  }
  const rec = account as Record<string, unknown>;
  const keys = [
    "authToken",
    "dateCreated",
    "dateUpdated",
    "friendlyName",
    "ownerAccountSid",
    "sid",
    "status",
    "subresourceUris",
    "type",
    "uri",
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in rec && rec[k] !== undefined) {
      out[k] = rec[k];
    }
  }
  return out;
}

/** Every new workspace starts with free credits so teams can try calling/texting before paying. */
export const NEW_WORKSPACE_WELCOME_CREDITS = 100;

export async function createNewWorkspace({
  workspaceName,
  user_id,
}: {
  workspaceName: string;
  user_id: string;
}): Promise<{
  data: string | null;
  error: string | null;
  provisioningWarning?: string | null;
}> {
  let workspaceId: string | null = null;
  const provisioningWarnings: string[] = [];

  try {
    const insertWorkspaceData = await rpcCreateNewWorkspace(workspaceName, user_id);
    const createdWorkspaceId = insertWorkspaceData;
    workspaceId = createdWorkspaceId;

    // Phase C: RPC still seeds legacy workspace_users; also create CHS membership
    // so getUserRole / requireWorkspaceAccess see the owner (no dual-write of
    // membership mutations elsewhere — this only fills the CHS gap left by RPC).
    const { error: ownerMembershipError } = await addUserToWorkspace({
      workspaceId: createdWorkspaceId,
      userId: user_id,
      role: "owner",
    });
    if (ownerMembershipError) {
      logger.error(
        "CHS owner membership insert failed after workspace create:",
        ownerMembershipError,
      );
      provisioningWarnings.push("Owner membership was not created");
    }

    let account: Awaited<ReturnType<typeof createSubaccount>> | null = null;
    try {
      account = await createSubaccount({
        workspace_id: createdWorkspaceId,
      });
      if (!account) {
        provisioningWarnings.push("Twilio subaccount was not created");
      }
    } catch (subaccountError) {
      logger.error("Twilio subaccount creation failed after workspace insert:", subaccountError);
      provisioningWarnings.push("Twilio subaccount creation failed");
    }

    let newKey: Awaited<ReturnType<typeof createKeys>> | null = null;
    if (account) {
      try {
        newKey = await createKeys({
          workspace_id: createdWorkspaceId,
          sid: account.sid,
          token: account.authToken,
        });
        if (!newKey) {
          provisioningWarnings.push("Twilio API keys were not created");
        }
      } catch (keyError) {
        logger.error("Twilio API key creation failed after workspace insert:", keyError);
        provisioningWarnings.push("Twilio API key creation failed");
      }
    }

    let stripeCustomerId: string | null = null;
    try {
      const newStripeCustomer = await createStripeContact({
        workspace_id: createdWorkspaceId,
      });
      stripeCustomerId = newStripeCustomer.id;
    } catch (stripeError) {
      logger.error("Stripe customer creation failed after workspace insert:", stripeError);
      provisioningWarnings.push("Stripe customer creation failed");
    }

    const seededOnboarding = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        subaccountBootstrap: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.subaccountBootstrap,
          callbackBaseUrl: env.BASE_URL(),
          inboundVoiceUrl: `${env.BASE_URL()}/api/inbound`,
          inboundSmsUrl: `${env.BASE_URL()}/api/inbound-sms`,
          statusCallbackUrl: `${env.BASE_URL()}/api/caller-id/status`,
          status: "provisioning",
        },
        status: "provisioning",
        currentStep: "business_profile",
        lastUpdatedBy: user_id,
      },
    );
    seededOnboarding.steps = buildOnboardingStepsForState(seededOnboarding);

    const twilioPayload = account
      ? { ...twilioAccountToPersistableJson(account), onboarding: seededOnboarding }
      : { onboarding: seededOnboarding };

    const workspaceUpdate: {
      twilio_data: string;
      key?: string;
      token?: string;
      stripe_id?: string;
    } = {
      twilio_data: JSON.stringify(twilioPayload),
    };
    if (newKey) {
      workspaceUpdate.key = newKey.sid;
      workspaceUpdate.token = newKey.secret;
    }
    if (stripeCustomerId) {
      workspaceUpdate.stripe_id = stripeCustomerId;
    }

    try {
      await adminDb
        .update(workspace)
        .set(workspaceUpdate)
        .where(eq(workspace.id, createdWorkspaceId));
      // workspaceUpdate always carries twilio_data (and, when Twilio keys
      // were minted above, key/token) — bust the cached credentials/client
      // for this workspace so subsequent lookups don't serve stale data.
      invalidateWorkspaceTwilioData(createdWorkspaceId);
    } catch (insertWorkspaceUsersError) {
      logger.error(
        "Workspace metadata update failed after workspace insert:",
        insertWorkspaceUsersError,
      );
      provisioningWarnings.push("Workspace provisioning metadata update failed");
    }

    if (account && newKey) {
      try {
        await ensureWorkspaceTwilioBootstrap({
          workspaceId: createdWorkspaceId,
          actorUserId: user_id,
        });
      } catch (bootstrapError) {
        logger.error(
          "Workspace Twilio bootstrap failed after workspace creation:",
          bootstrapError,
        );
        provisioningWarnings.push("Twilio bootstrap is still running");
      }
    }

    try {
      await insertTransactionHistoryIdempotent({
        workspaceId: createdWorkspaceId,
        type: "CREDIT",
        amount: NEW_WORKSPACE_WELCOME_CREDITS,
        note: `Welcome bonus: ${NEW_WORKSPACE_WELCOME_CREDITS} free credits to get started`,
        idempotencyKey: `welcome-credits:${createdWorkspaceId}`,
      });
    } catch (welcomeCreditError) {
      logger.error(
        "Welcome credit grant failed after workspace creation:",
        welcomeCreditError,
      );
      provisioningWarnings.push("Welcome credits were not granted");
    }

    try {
      await seedWorkspaceSampleData(createdWorkspaceId, user_id);
    } catch (seedError) {
      logger.error(
        "Sample data seeding failed after workspace creation:",
        seedError,
      );
      provisioningWarnings.push("Sample data seeding failed");
    }

    return {
      data: workspaceId,
      error: null,
      provisioningWarning:
        provisioningWarnings.length > 0 ? provisioningWarnings.join("; ") : null,
    };
  } catch (error) {
    logger.error("Error in createNewWorkspace:", error);
    if (workspaceId) {
      return {
        data: workspaceId,
        error: null,
        provisioningWarning:
          error instanceof Error
            ? `Workspace created but provisioning failed: ${error.message}`
            : "Workspace created but provisioning failed",
      };
    }
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
      provisioningWarning: null,
    };
  }
}

export async function getWorkspaceInfo({
  workspaceId,
}: {
  workspaceId: string | undefined;
  null?: never;
}) {
  if (workspaceId == null) return { error: "No workspace id" };

  try {
    const data = await adminDb.query.workspace.findFirst({
      where: eq(workspace.id, workspaceId),
      columns: { name: true },
    });
    return { data: data ?? null, error: null };
  } catch (error) {
    const dbError = toDbError(error);
    logger.error(`Error on function getWorkspaceInfo: ${dbError.details ?? dbError.message}`);
    return { data: null, error: dbError };
  }
}

export type WorkspaceInfoWithDetails = {
  workspace: WorkspaceData & { workspace_users: { role: MemberRole }[] };
  workspace_users: { role: MemberRole }[];
  campaigns: unknown[];
  phoneNumbers: Partial<WorkspaceNumbers[]>;
  audiences: unknown[];
};

export async function getWorkspaceInfoWithDetails({
  workspaceId,
  userId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  userId: string;
  tdb?: TenantDb;
  null?: never;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  const workspaceRow = await adminDb.query.workspace.findFirst({
    where: eq(workspace.id, workspaceId),
    columns: { id: true, name: true, credits: true },
  });
  if (!workspaceRow) {
    throw notFoundError();
  }

  const membership = await tdb.workspace_member.findFirst({
    where: eq(workspace_member.user_id, userId),
    columns: { id: true, role_id: true },
  });
  if (!membership) {
    throw notFoundError();
  }

  const [campaigns, phoneNumbers, audiences] = await Promise.all([
    tdb.campaign.findMany(),
    tdb.workspace_number.findMany({
      columns: { id: true, phone_number: true, capabilities: true },
    }),
    tdb.audience.findMany({
      columns: { id: true, name: true },
    }),
  ]);

  const workspace_users_list = [{ role: membership.role_id as MemberRole }];

  return {
    workspace: {
      ...workspaceRow,
      workspace_users: workspace_users_list,
    },
    campaigns,
    phoneNumbers,
    audiences,
  } as unknown as WorkspaceInfoWithDetails;
}

export async function getWorkspaceUsers({
  workspaceId,
}: {
  workspaceId: string;
}) {
  try {
    const data = await rpcGetWorkspaceUsers(workspaceId);
    return { data, error: null };
  } catch (error) {
    logger.error("Error on function getWorkspaceUsers", error);
    return { data: null, error: error as Error };
  }
}

export async function getWorkspacePhoneNumbers({
  workspaceId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  tdb?: TenantDb;
  null?: never;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  try {
    const data = await tdb.workspace_number.findMany();
    return { data, error: null };
  } catch (error) {
    logger.error("Error on function getWorkspacePhoneNumbers", error);
    return { data: null, error: toDbError(error) };
  }
}

/**
 * Returns the first handset-enabled number for the workspace, or the first voice-capable number.
 * Used by the handset page to show which number to call.
 */
export async function getHandsetNumberForWorkspace({
  workspaceId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  tdb?: TenantDb;
  null?: never;
}): Promise<{
  data: { id: number; phone_number: string | null } | null;
  error: DbQueryError | null;
}> {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  try {
    const handset = await tdb.workspace_number.findFirst({
      where: eq(workspace_number.handset_enabled, true),
      columns: { id: true, phone_number: true },
    });
    if (handset) return { data: handset, error: null };

    const first = await tdb.workspace_number.findFirst({
      columns: { id: true, phone_number: true },
    });
    return { data: first ?? null, error: null };
  } catch (error) {
    return { data: null, error: toDbError(error) };
  }
}

export async function updateWorkspacePhoneNumber({
  workspaceId,
  numberId,
  updates,
  tdb: tdbIn,
}: {
  workspaceId: string;
  numberId: string | number;
  updates: Partial<NonNullable<WorkspaceNumbers>>;
  tdb?: TenantDb;
  null?: never;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  try {
    const rows = await tdb.workspace_number.update({
      set: updates,
      where: eq(workspace_number.id, Number(numberId)),
    });
    const data = rows[0] ?? null;
    return { data, error: data ? null : toDbError(new Error("Not found")) };
  } catch (error) {
    return { data: null, error: toDbError(error) };
  }
}

export async function updateUserWorkspaceAccessDate({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<void> {
  try {
    await rpcUpdateUserWorkspaceLastAccessTime(userId, workspaceId);
  } catch (updatedTimeError) {
    logger.error("Error updating user access time: ", updatedTimeError);
  }
}

export async function handleExistingUserSession(
  serverSession: { user: { id: string } },
  headers: Headers,
) {
  try {
    const invites = await adminDb
      .select()
      .from(workspace_invite)
      .where(eq(workspace_invite.user_id, serverSession.user.id));
    return routeData({ newSession: serverSession, invites, error: null }, { headers });
  } catch (inviteError) {
    return routeData(
      { error: inviteError, newSession: null, invites: [] },
      { headers },
    );
  }
}

export async function handleNewUserOTPVerification(
  request: Request,
  token_hash: string,
  type: "signup" | "invite" | "magiclink" | "recovery" | "email_change",
  headers: Headers,
) {
  if (!token_hash) {
    return routeData({ error: "Invalid invitation link" }, { headers });
  }

  try {
    const result = (await auth.api.verifyEmail({
      query: { token: token_hash },
      headers: request.headers,
      returnHeaders: true,
    })) as unknown as { headers?: Headers; response?: { user?: { id: string } } };
    const mergedHeaders = mergeBetterAuthSetCookieHeaders(result?.headers, headers);
    const user = result?.response?.user;

    if (!user) {
      return routeData({ error: "Failed to create session" }, { headers: mergedHeaders });
    }

    try {
      const invites = await adminDb
        .select()
        .from(workspace_invite)
        .where(eq(workspace_invite.user_id, user.id));
      return routeData(
        { newSession: { user }, invites },
        { headers: mergedHeaders },
      );
    } catch (inviteError) {
      return routeData({ error: inviteError }, { headers: mergedHeaders });
    }
  } catch (error) {
    return routeData({ error }, { headers });
  }
}

/**
 * Per-process TTL cache of constructed `Twilio.Twilio` clients, keyed by
 * workspace id. `createWorkspaceTwilioInstance` is called on essentially
 * every workspace-scoped Twilio REST call, and building a client means both
 * a DB round trip for credentials and constructing a new `Twilio.Twilio`
 * instance; neither is needed on every call since credentials rarely
 * change.
 *
 * Entries are tagged with the workspace's Twilio-data version (from
 * merge-workspace-twilio-data.server.ts) so a credential write anywhere in
 * the app invalidates the memoized client immediately, without waiting out
 * the TTL — the TTL alone only bounds staleness for writes this cache can't
 * observe directly (see loadWorkspaceTwilioData's cache comment). This does
 * not touch the separate parent/global Twilio client singleton in
 * app/twilio.server.ts.
 */
const WORKSPACE_TWILIO_CLIENT_CACHE_TTL_MS = 60_000;

type WorkspaceTwilioClientCacheEntry = {
  client: Twilio.Twilio;
  version: number;
  expiresAt: number;
};

const workspaceTwilioClientCache = new Map<string, WorkspaceTwilioClientCacheEntry>();

export async function createWorkspaceTwilioInstance({
  workspace_id,
}: {
  workspace_id: string;
  client?: never;
}) {
  const currentVersion = getWorkspaceTwilioDataVersion(workspace_id);
  const cached = workspaceTwilioClientCache.get(workspace_id);
  if (
    cached &&
    cached.version === currentVersion &&
    cached.expiresAt > Date.now()
  ) {
    return cached.client;
  }

  const data = await adminDb.query.workspace.findFirst({
    where: eq(workspace.id, workspace_id),
    columns: { twilio_data: true, key: true, token: true },
  });
  if (!data) {
    throw new Error("No workspace found");
  }
  const creds = readTwilioWorkspaceCredentials(parseTwilioDataColumn(data.twilio_data));
  if (!creds) {
    throw new Error("Workspace missing Twilio credentials");
  }
  // ADR-0011: REST calls use workspace API keys (workspace.key/workspace.token)
  // when present; auth token is only used for webhook signature validation.
  // Twilio SDK API-key auth: `new Twilio(apiKey, apiSecret, { accountSid })`.
  const apiKey = typeof data.key === "string" ? data.key.trim() : "";
  const apiSecret = typeof data.token === "string" ? data.token.trim() : "";
  const twilio =
    apiKey && apiSecret
      ? new Twilio.Twilio(apiKey, apiSecret, { accountSid: creds.sid })
      : new Twilio.Twilio(creds.sid, creds.authToken);

  workspaceTwilioClientCache.set(workspace_id, {
    client: twilio,
    version: currentVersion,
    expiresAt: Date.now() + WORKSPACE_TWILIO_CLIENT_CACHE_TTL_MS,
  });

  return twilio;
}

export async function removeWorkspacePhoneNumber({
  workspaceId,
  numberId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  numberId: bigint;
  tdb?: TenantDb;
  null?: never;
}) {
  const normalizedNumberId = Number(numberId);
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  try {
    const number = await tdb.workspace_number.findFirst({
      where: eq(workspace_number.id, normalizedNumberId),
    });
    if (!number) {
      throw new Error("Number not found");
    }
    const twilio = await createWorkspaceTwilioInstance({
      workspace_id: workspaceId,
    });

    // Prefer the stored Twilio IncomingPhoneNumber SID for a direct,
    // SID-based release. Only fall back to friendly_name matching for legacy
    // rows that predate the twilio_phone_number_sid column.
    const storedSid = number.twilio_phone_number_sid ?? null;
    let incomingSids: string[];
    if (storedSid) {
      incomingSids = [storedSid];
    } else {
      if (!number.friendly_name) {
        throw new Error("Friendly name is required");
      }
      const incomingIds = await twilio.incomingPhoneNumbers.list({
        friendlyName: number.friendly_name,
      });
      incomingSids = incomingIds.map((id) => id.sid);
    }

    // Explicitly detach from the workspace Messaging Service before releasing
    // the number, so the MS sender pool does not hold a dangling reference.
    const onboarding = await getWorkspaceMessagingOnboardingState({
      workspaceId,
    });
    const msSid = onboarding.messagingService.serviceSid;
    if (msSid) {
      for (const sid of incomingSids) {
        try {
          await twilio.messaging.v1.services(msSid).phoneNumbers(sid).remove();
        } catch (detachError) {
          // Ignore "not attached" / already-detached errors.
          logger.warn(
            `MS detach skipped for ${sid}: ${
              detachError instanceof Error
                ? detachError.message
                : String(detachError)
            }`,
          );
        }
      }
    }

    // Outgoing caller-ID cleanup (match by friendly_name when available).
    const outgoingIds = number.friendly_name
      ? await twilio.outgoingCallerIds.list({
          friendlyName: number.friendly_name,
        })
      : [];

    await Promise.all([
      ...outgoingIds.map(async (id) => {
        return await twilio.outgoingCallerIds(id.sid).remove();
      }),
      ...incomingSids.map(async (sid) => {
        return await twilio.incomingPhoneNumbers(sid).remove();
      }),
    ]);
    await tdb.workspace_number.delete({
      where: eq(workspace_number.id, normalizedNumberId),
    });

    // Drop the released number from the Messaging Service attached senders.
    if (number.phone_number) {
      const releasedPhone = number.phone_number;
      await updateWorkspaceMessagingOnboardingState({
        workspaceId,
        updates: {
          messagingService: {
            ...onboarding.messagingService,
            attachedSenderPhoneNumbers:
              onboarding.messagingService.attachedSenderPhoneNumbers.filter(
                (p) => p !== releasedPhone,
              ),
          },
        },
        actorUserId: null,
      });
    }

    return { error: null };
  } catch (error) {
    return { error };
  }
}

export async function updateCallerId({
  workspaceId,
  number,
  friendly_name,
}: {
  workspaceId: string;
  number: WorkspaceNumbers;
  friendly_name: string;
  null?: never;
}) {
  if (!number || !number.phone_number) return { error: null };
  try {
    const twilio = await createWorkspaceTwilioInstance({
      workspace_id: workspaceId,
    });

    const [outgoingIds, incomingIds] = await Promise.all([
      twilio.outgoingCallerIds.list({ phoneNumber: number.phone_number }),
      twilio.incomingPhoneNumbers.list({ phoneNumber: number.phone_number }),
    ]);
    const updatedOutgoing = Promise.all(
      outgoingIds.map((id) =>
        twilio
          .outgoingCallerIds(id.sid)
          .update({ friendlyName: friendly_name }),
      ),
    );

    const updatedIncoming = Promise.all(
      incomingIds.map((id) =>
        twilio
          .incomingPhoneNumbers(id.sid)
          .update({ friendlyName: friendly_name }),
      ),
    );

    await Promise.all([updatedOutgoing, updatedIncoming]);
    return { error: null };
  } catch (error) {
    logger.error("Error updating caller ID", error);
    return { error };
  }
}

export async function fetchWorkspaceData(
  workspaceId: string,
  tdbIn?: TenantDb,
) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  try {
    const workspaceRow = await adminDb.query.workspace.findFirst({
      where: eq(workspace.id, workspaceId),
    });
    if (!workspaceRow) {
      return { workspace: null, workspaceError: toDbError(new Error("Not found")) };
    }
    const numbers = await tdb.workspace_number.findMany({
      where: eq(workspace_number.type, "rented"),
    });
    return {
      workspace: { ...workspaceRow, workspace_number: numbers },
      workspaceError: null,
    };
  } catch (error) {
    return { workspace: null, workspaceError: toDbError(error) };
  }
}

export async function getWorkspaceScripts({
  workspace,
  tdb: tdbIn,
}: {
  workspace: string;
  tdb?: TenantDb;
  client?: never;
}) {
  const tdb = tdbIn ?? createTenantDb(workspace);
  try {
    return await tdb.script.findMany();
  } catch (error) {
    logger.error("Error fetching scripts", error);
    return undefined;
  }
}

export {
  getRecordingFileNames,
  getMedia,
  listMedia,
  getSignedUrls,
} from "./workspace-media.server";

export {
  fetchConversationSummary,
} from "./workspace-conversations.server";

export async function acceptWorkspaceInvitations(
  invitationIds: string[],
  userId: string,
) {
  const errors: Array<{ invitationId: string; type: string }> = [];
  if (invitationIds.length === 0) {
    return { errors };
  }

  let inviteRows: { id: string; workspace: string; role: string }[];
  try {
    // SEC-03 stopgap: only invites addressed to this user are selectable.
    // Foreign/missing IDs are omitted from processing (no membership insert);
    // callers see them as invite errors without distinguishing ownership.
    inviteRows = await adminDb
      .select({
        id: workspace_invite.id,
        workspace: workspace_invite.workspace,
        role: workspace_invite.role,
      })
      .from(workspace_invite)
      .where(
        and(
          inArray(workspace_invite.id, invitationIds),
          eq(workspace_invite.user_id, userId),
        ),
      );
  } catch {
    return {
      errors: invitationIds.map((invitationId) => ({
        invitationId,
        type: "invite",
      })),
    };
  }

  const invitesById = new Map(
    inviteRows.map((invite) => [String(invite.id), invite]),
  );

  const processableInvites = invitationIds
    .map((invitationId) => {
      const invite = invitesById.get(invitationId);
      if (!invite) {
        // Missing and foreign invite IDs share this path (no existence leak).
        errors.push({ invitationId, type: "invite" });
        return null;
      }
      return { invitationId, invite };
    })
    .filter(
      (
        value,
      ): value is {
        invitationId: string;
        invite: {
          id: string;
          workspace: string;
          role: "owner" | "admin" | "caller" | "member";
        };
      } => value !== null,
    );

  const invitationResults = await Promise.all(
    processableInvites.map(async ({ invitationId, invite }) => {
      const invitationErrors: Array<{ invitationId: string; type: string }> =
        [];
      const tdb = createTenantDb(invite.workspace);

      const { error: workspaceError } = await addUserToWorkspace({
        workspaceId: invite.workspace,
        userId,
        role: invite.role,
        tdb,
      });
      if (workspaceError) {
        invitationErrors.push({ invitationId, type: "workspace" });
      }

      try {
        await tdb.workspace_invite.delete({
          where: and(
            eq(workspace_invite.id, invitationId),
            eq(workspace_invite.user_id, userId),
          ),
        });
      } catch {
        invitationErrors.push({ invitationId, type: "deletion" });
      }

      return invitationErrors;
    }),
  );

  for (const invitationErrors of invitationResults) {
    errors.push(...invitationErrors);
  }

  return { errors };
}

export async function getInvitesByUserId(user_id: string) {
  return adminDb
    .select()
    .from(workspace_invite)
    .where(eq(workspace_invite.user_id, user_id));
}
