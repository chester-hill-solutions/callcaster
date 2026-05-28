/**
 * Workspace-related database functions
 */
import Twilio from "twilio";
import { PostgrestError, SupabaseClient, Session } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { WorkspaceData, WorkspaceNumbers } from "../types";
import { NewKeyInstance } from "twilio/lib/rest/api/v2010/account/newKey";
import { MemberRole } from "@/components/workspace/TeamMember";
import { env } from "../env.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { logger } from "../logger.server";
import { data as routeData } from "react-router";
import { createStripeContact } from "./stripe.server";
import { AppError, ErrorCode } from "@/lib/errors.server";
import {
  buildOnboardingStepsForState,
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";

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

export async function getUserWorkspaces({
  supabaseClient,
}: {
  supabaseClient: SupabaseClient<Database>;
}) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session == null) {
    return { data: null, error: "No user session found" };
  }

  const workspacesQuery = supabaseClient
    .from("workspace")
    .select("*")
    .order("created_at", { ascending: false });

  const { data, error }: { data: WorkspaceData; error: PostgrestError | null } =
    await workspacesQuery;

  if (error) {
    logger.error("Error on function getUserWorkspaces: ", error);
  }

  return { data, error };
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

export async function createNewWorkspace({
  supabaseClient,
  workspaceName,
  user_id,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceName: string;
  user_id: string;
}) {
  try {
    const { data: insertWorkspaceData, error: insertWorkspaceError } =
      await supabaseClient.rpc("create_new_workspace", {
        new_workspace_name: workspaceName,
        user_id,
      });
    if (insertWorkspaceError) {
      throw insertWorkspaceError;
    }
    if (!insertWorkspaceData) {
      throw new Error("Workspace creation RPC returned no workspace id");
    }

    const account = await createSubaccount({
      workspace_id: insertWorkspaceData!,
    });

    if (!account) {
      throw new Error("Failed to create Twilio subaccount");
    }

    const newKey = await createKeys({
      workspace_id: insertWorkspaceData!,
      sid: account.sid,
      token: account.authToken,
    });
    if (!newKey) {
      throw new Error("Failed to create Twilio API keys");
    }

    const newStripeCustomer = await createStripeContact({
      supabaseClient,
      workspace_id: insertWorkspaceData!,
    });

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
        currentStep: "messaging_service",
        lastUpdatedBy: user_id,
      },
    );
    seededOnboarding.steps = buildOnboardingStepsForState(seededOnboarding);

    const { error: insertWorkspaceUsersError } = await supabaseClient
      .from("workspace")
      .update({
        twilio_data: {
          ...twilioAccountToPersistableJson(account),
          onboarding: seededOnboarding,
        } as unknown as Database["public"]["Tables"]["workspace"]["Update"]["twilio_data"],
        key: newKey.sid,
        token: newKey.secret,
        stripe_id: newStripeCustomer.id,
      })
      .eq("id", insertWorkspaceData!);
    if (insertWorkspaceUsersError) {
      throw insertWorkspaceUsersError;
    }

    try {
      await ensureWorkspaceTwilioBootstrap({
        supabaseClient,
        workspaceId: insertWorkspaceData!,
        actorUserId: user_id,
      });
    } catch (bootstrapError) {
      logger.error(
        "Workspace Twilio bootstrap failed after workspace creation:",
        bootstrapError,
      );
    }

    return { data: insertWorkspaceData, error: null };
  } catch (error) {
    logger.error("Error in createNewWorkspace:", error);
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

export async function getWorkspaceInfo({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string | undefined;
}) {
  if (workspaceId == null) return { error: "No workspace id" };

  const { data, error } = await supabaseClient
    .from("workspace")
    .select("name")
    .eq("id", workspaceId)
    .single();

  if (error) {
    logger.error(`Error on function getWorkspaceInfo: ${error.details}`);
  }

  return { data, error };
}

export type WorkspaceInfoWithDetails = {
  workspace: WorkspaceData & { workspace_users: { role: MemberRole }[] };
  workspace_users: { role: MemberRole }[];
  campaigns: unknown[];
  phoneNumbers: Partial<WorkspaceNumbers[]>;
  audiences: unknown[];
};

export async function getWorkspaceInfoWithDetails({
  supabaseClient,
  workspaceId,
  userId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  userId: string;
}) {
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select(
      `id, name, credits, 
        workspace_users(id, role), 
        campaign(*), 
        workspace_number(id, phone_number, capabilities), 
        audience(id, name)`,
    )
    .eq("id", workspaceId)
    .eq("workspace_users.user_id", userId)
    .single();
  if (workspaceError) throw workspaceError;
  const { campaign, workspace_number, audience, ...rest } = workspace;
  return {
    workspace: rest,
    campaigns: campaign,
    phoneNumbers: workspace_number,
    audiences: audience,
  } as unknown as WorkspaceInfoWithDetails;
}

export async function getWorkspaceUsers({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data, error } = await supabaseClient.rpc("get_workspace_users", {
    selected_workspace_id: workspaceId,
  });
  if (error) {
    logger.error("Error on function getWorkspaceUsers", error);
  }

  return { data, error };
}

export async function getWorkspacePhoneNumbers({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data, error } = await supabaseClient
    .from("workspace_number")
    .select()
    .eq(`workspace`, workspaceId);
  if (error) {
    logger.error("Error on function getWorkspacePhoneNumbers", error);
  }
  return { data, error };
}

/**
 * Returns the first handset-enabled number for the workspace, or the first voice-capable number.
 * Used by the handset page to show which number to call.
 */
export async function getHandsetNumberForWorkspace({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}): Promise<{
  data: { id: number; phone_number: string | null } | null;
  error: PostgrestError | null;
}> {
  const { data: handset } = await supabaseClient
    .from("workspace_number")
    .select("id, phone_number")
    .eq("workspace", workspaceId)
    .eq("handset_enabled", true)
    .limit(1)
    .maybeSingle();
  if (handset) return { data: handset, error: null };
  const { data: first } = await supabaseClient
    .from("workspace_number")
    .select("id, phone_number")
    .eq("workspace", workspaceId)
    .limit(1)
    .maybeSingle();
  return { data: first, error: null };
}

export async function updateWorkspacePhoneNumber({
  supabaseClient,
  workspaceId,
  numberId,
  updates,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  numberId: string | number;
  updates: Partial<NonNullable<WorkspaceNumbers>>;
}) {
  const { data, error } = await supabaseClient
    .from("workspace_number")
    .update(updates)
    .eq("id", Number(numberId))
    .eq("workspace", workspaceId)
    .select()
    .single();
  return { data, error };
}

export async function addUserToWorkspace({
  supabaseClient,
  workspaceId,
  userId,
  role,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "caller" | "member";
}) {
  const { data, error } = await supabaseClient
    .from("workspace_users")
    .insert({ workspace_id: workspaceId, user_id: userId, role })
    .select()
    .single();
  if (error) {
    logger.error("Failed to join workspace", error);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function getUserRole({
  supabaseClient,
  user,
  workspaceId,
}: {
  supabaseClient: SupabaseClient;
  user: { id: string } | null;
  workspaceId: string;
}) {
  if (!user) {
    return null;
  }

  const { data: userRole, error: userRoleError } = await supabaseClient
    .from("workspace_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (userRoleError) {
    const errorCode = (userRoleError as { code?: string }).code;
    if (errorCode !== "PGRST116") {
      logger.error("Failed to load user role for workspace", {
        workspaceId,
        userId: user.id,
        code: errorCode,
        message: userRoleError.message,
      });
    }
  }

  return userRole;
}

/**
 * Verify that the user has access to the workspace. Throws AppError with 403 if not.
 * Use as defense-in-depth when workspace_id comes from request body.
 */
export async function requireWorkspaceAccess({
  supabaseClient,
  user,
  workspaceId,
}: {
  supabaseClient: SupabaseClient;
  user: { id: string };
  workspaceId: string;
}): Promise<void> {
  const role = await getUserRole({
    supabaseClient,
    user,
    workspaceId,
  });
  if (!role || !["owner", "admin", "member", "caller"].includes(role.role)) {
    throw new AppError("Access denied to workspace", 403, ErrorCode.FORBIDDEN);
  }
}

export async function updateUserWorkspaceAccessDate({
  workspaceId,
  supabaseClient,
}: {
  workspaceId: string;
  supabaseClient: SupabaseClient<Database>;
}): Promise<void> {
  const { data: updatedTime, error: updatedTimeError } =
    await supabaseClient.rpc("update_user_workspace_last_access_time", {
      selected_workspace_id: workspaceId,
    });

  if (updatedTimeError) {
    logger.error("Error updating user access time: ", updatedTimeError);
  }

  return;
}

export async function handleExistingUserSession(
  supabaseClient: SupabaseClient,
  serverSession: Session,
  headers: Headers,
) {
  const { data: invites, error: inviteError } = await supabaseClient
    .from("workspace_invite")
    .select()
    .eq("user_id", serverSession.user.id);
  if (inviteError)
    return routeData(
      { error: inviteError, newSession: null, invites: [] },
      { headers },
    );
  return routeData({ newSession: serverSession, invites, error: null }, { headers });
}

export async function handleNewUserOTPVerification(
  supabaseClient: SupabaseClient,
  token_hash: string,
  type: "signup" | "invite" | "magiclink" | "recovery" | "email_change",
  headers: Headers,
) {
  if (!token_hash) {
    return routeData({ error: "Invalid invitation link" }, { headers });
  }

  const { data, error } = await supabaseClient.auth.verifyOtp({
    token_hash,
    type: type as
      | "signup"
      | "invite"
      | "magiclink"
      | "recovery"
      | "email_change",
  });

  if (error) return routeData({ error }, { headers });

  const newSession = data.session;

  if (newSession) {
    const { error: sessionError } =
      await supabaseClient.auth.setSession(newSession);
    if (sessionError) return routeData({ error: sessionError }, { headers });

    const { data: invites, error: inviteError } = await supabaseClient
      .from("workspace_invite")
      .select()
      .eq("user_id", newSession.user.id);

    if (inviteError) return routeData({ error: inviteError }, { headers });

    return routeData({ newSession, invites }, { headers });
  } else {
    return routeData({ error: "Failed to create session" }, { headers });
  }
}

export async function createWorkspaceTwilioInstance({
  supabase,
  workspace_id,
}: {
  supabase: SupabaseClient;
  workspace_id: string;
}) {
  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data, key, token")
    .eq("id", workspace_id)
    .single();
  if (error) throw error;
  const creds = readTwilioWorkspaceCredentials(data.twilio_data);
  if (!creds) {
    throw new Error("Workspace missing Twilio credentials");
  }
  const twilio = new Twilio.Twilio(creds.sid, creds.authToken);
  return twilio;
}

export async function removeWorkspacePhoneNumber({
  supabaseClient,
  workspaceId,
  numberId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  numberId: bigint;
}) {
  const normalizedNumberId = Number(numberId);
  try {
    const { data: number, error: numberError } = await supabaseClient
      .from("workspace_number")
      .select()
      .eq("id", normalizedNumberId)
      .single();
    if (numberError) throw numberError;
    const twilio = await createWorkspaceTwilioInstance({
      supabase: supabaseClient,
      workspace_id: workspaceId,
    });
    if (!number.friendly_name) {
      throw new Error("Friendly name is required");
    }
    const outgoingIds = await twilio.outgoingCallerIds.list({
      friendlyName: number.friendly_name,
    });
    const incomingIds = await twilio.incomingPhoneNumbers.list({
      friendlyName: number.friendly_name,
    });
    await Promise.all([
      ...outgoingIds.map(async (id) => {
        return await twilio.outgoingCallerIds(id.sid).remove();
      }),
      ...incomingIds.map(async (id) => {
        return await twilio.incomingPhoneNumbers(id.sid).remove();
      }),
    ]);
    const { error: deletionError } = await supabaseClient
      .from("workspace_number")
      .delete()
      .eq("id", normalizedNumberId);

    if (deletionError) throw deletionError;
    return { error: null };
  } catch (error) {
    return { error };
  }
}

export async function updateCallerId({
  supabaseClient,
  workspaceId,
  number,
  friendly_name,
}: {
  supabaseClient: SupabaseClient;
  workspaceId: string;
  number: WorkspaceNumbers;
  friendly_name: string;
}) {
  if (!number || !number.phone_number) return { error: null };
  try {
    const twilio = await createWorkspaceTwilioInstance({
      supabase: supabaseClient,
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
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
) {
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select(`*, workspace_number(*)`)
    .eq("id", workspaceId)
    .eq("workspace_number.type", "rented")
    .single();

  return { workspace, workspaceError };
}

export async function getWorkspaceScripts({
  workspace,
  supabase,
}: {
  workspace: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("script")
    .select()
    .eq("workspace", workspace);
  if (error) logger.error("Error fetching scripts", error);
  return data;
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
  supabaseClient: SupabaseClient<Database>,
  invitationIds: string[],
  userId: string,
) {
  const errors: Array<{ invitationId: string; type: string }> = [];
  if (invitationIds.length === 0) {
    return { errors };
  }

  const { data: inviteRows, error: inviteQueryError } = await supabaseClient
    .from("workspace_invite")
    .select("id, workspace, role")
    .in("id", invitationIds);

  if (inviteQueryError) {
    return {
      errors: invitationIds.map((invitationId) => ({
        invitationId,
        type: "invite",
      })),
    };
  }

  const invitesById = new Map(
    (inviteRows ?? []).map((invite) => [String(invite.id), invite]),
  );

  const processableInvites = invitationIds
    .map((invitationId) => {
      const invite = invitesById.get(invitationId);
      if (!invite) {
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

      const { error: workspaceError } = await addUserToWorkspace({
        supabaseClient,
        workspaceId: invite.workspace,
        userId,
        role: invite.role,
      });
      if (workspaceError) {
        invitationErrors.push({ invitationId, type: "workspace" });
      }

      const { error: deletionError } = await supabaseClient
        .from("workspace_invite")
        .delete()
        .eq("id", invitationId);

      if (deletionError) {
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

export async function getInvitesByUserId(
  supabase: SupabaseClient,
  user_id: string,
) {
  const { data, error } = await supabase
    .from("workspace_invite")
    .select()
    .eq("user_id", user_id);
  if (error) throw error;
  return data;
}
