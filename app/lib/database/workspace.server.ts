/**
 * Workspace-related database functions
 */
import Twilio from "twilio";
import { PostgrestError, SupabaseClient, Session } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import {
  WorkspaceData,
  WorkspaceNumbers,
  User,
} from "../types";
import { NewKeyInstance } from "twilio/lib/rest/api/v2010/account/newKey";
import { MemberRole } from "~/components/Workspace/TeamMember";
import { env } from "../env.server";
import { logger } from "../logger.server";
import { json } from "@remix-run/node";
import { createStripeContact } from "./stripe.server";

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
  const twilio = new Twilio.Twilio(
    env.TWILIO_SID(),
    env.TWILIO_AUTH_TOKEN(),
  );
  const account = await twilio.api.v2010.accounts
    .create({
      friendlyName: workspace_id,
    })
    .catch((error) => {
      logger.error("Error creating subaccount", error);
    });
  return account;
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
      logger.error(insertWorkspaceError);
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

    const { error: insertWorkspaceUsersError } = await supabaseClient
      .from("workspace")
      .update({
        twilio_data: Object(account),
        key: newKey.sid,
        token: newKey.secret,
        stripe_id: newStripeCustomer.id,
      })
      .eq("id", insertWorkspaceData!);
    if (insertWorkspaceUsersError) {
      throw insertWorkspaceUsersError;
    }

    return { data: insertWorkspaceData, error: null };
  } catch (error) {
    logger.error("Error in createNewWorkspace:", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
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
        audience(id, name)`
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
    audiences: audience
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

export async function updateWorkspacePhoneNumber({
  supabaseClient,
  workspaceId,
  numberId,
  updates,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  numberId: string;
  updates: Partial<WorkspaceNumbers>;
}) {
  const { data, error } = await supabaseClient
    .from("workspace_number")
    .update(updates)
    .eq("id", numberId)
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
  user: User;
  workspaceId: string;
}) {
  if (!user) {
    return null;
  }

  const {data: userRole, error: userRoleError} = await supabaseClient
    .from("workspace_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (userRoleError) {
    logger.error("No User Role found on this workspace");
  }

  return userRole;
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
    return json(
      { error: inviteError, newSession: null, invites: [] },
      { headers },
    );
  return json({ newSession: serverSession, invites, error: null }, { headers });
}

export async function handleNewUserOTPVerification(
  supabaseClient: SupabaseClient,
  token_hash: string,
  type: "signup" | "invite" | "magiclink" | "recovery" | "email_change",
  headers: Headers,
) {
  if (!token_hash) {
    return json({ error: "Invalid invitation link" }, { headers });
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

  if (error) return json({ error }, { headers });

  const newSession = data.session;

  if (newSession) {
    const { error: sessionError } =
      await supabaseClient.auth.setSession(newSession);
    if (sessionError) return json({ error: sessionError }, { headers });

    const { data: invites, error: inviteError } = await supabaseClient
      .from("workspace_invite")
      .select()
      .eq("user_id", newSession.user.id);

    if (inviteError) return json({ error: inviteError }, { headers });

    return json({ newSession, invites }, { headers });
  } else {
    return json({ error: "Failed to create session" }, { headers });
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
  const twilio = new Twilio.Twilio(
    data.twilio_data.sid,
    data.twilio_data.authToken,
  );
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
  try {
    const { data: number, error: numberError } = await supabaseClient
      .from("workspace_number")
      .select()
      .eq("id", numberId)
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
    outgoingIds.map(async (id) => {
      return await twilio.outgoingCallerIds(id.sid).remove();
    });
    incomingIds.map(async (id) => {
      return await twilio.incomingPhoneNumbers(id.sid).remove();
    });
    const { error: deletionError } = await supabaseClient
      .from("workspace_number")
      .delete()
      .eq("id", numberId);

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
  if (!number || !number.phone_number) return;
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

    await Promise.all([
      updatedOutgoing,
      updatedIncoming,
    ]);
  } catch (error) {
    logger.error(error);
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

export function getRecordingFileNames(stepData: unknown[]) {
  if (!Array.isArray(stepData)) {
    logger.warn("stepData is not an array");
    return [];
  }

  return stepData.reduce((fileNames: string[], step: { speechType?: string; say?: string }) => {
    if (
      step.speechType === "recorded" &&
      step.say &&
      step.say !== "Enter your question here"
    ) {
      fileNames.push(step.say);
    }
    return fileNames;
  }, []);
}

export async function getMedia(
  fileNames: Array<string>,
  supabaseClient: SupabaseClient,
  workspace_id: string,
) {
  const media = await Promise.all(
    fileNames.map(async (mediaName) => {
      const { data, error } = await supabaseClient.storage
        .from("workspaceAudio")
        .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
      if (error) throw error;
      return { [mediaName]: data.signedUrl };
    }),
  );

  return media;
}

export async function listMedia(
  supabaseClient: SupabaseClient,
  workspace: string,
) {
  const { data, error } = await supabaseClient.storage
    .from(`workspaceAudio`)
    .list(workspace);
  if (error) logger.error(error);
  return data;
}

export async function getSignedUrls(
  supabaseClient: SupabaseClient,
  workspace_id: string,
  mediaNames: string[],
) {
  return Promise.all(
    mediaNames.map(async (mediaName) => {
      const { data, error } = await supabaseClient.storage
        .from("messageMedia")
        .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
      if (error) throw error;
      return data.signedUrl;
    }),
  );
}

export async function acceptWorkspaceInvitations(
  supabaseClient: SupabaseClient<Database>,
  invitationIds: string[],
  userId: string,
) {
  let errors = [];
  for (const invitationId of invitationIds) {
    const { data: invite, error: inviteError } = await supabaseClient
      .from("workspace_invite")
      .select()
      .eq("id", invitationId)
      .single();
    if (inviteError) errors.push({ invitationId: inviteError, type: "invite" });

    const { error: workspaceError } = await addUserToWorkspace({
      supabaseClient: supabaseClient,
      workspaceId: invite.workspace,
      userId: userId,
      role: invite.role,
    });
    if (workspaceError)
      errors.push({ invitationId: inviteError, type: "workspace" });

    const { error: deletionError } = await supabaseClient
      .from("workspace_invite")
      .delete()
      .eq("id", invitationId);

    if (deletionError)
      errors.push({ invitationId: inviteError, type: "deletion" });
    return { errors };
  }
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

export async function fetchConversationSummary(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  campaign_id?: string | null,
) {
  let chats, chatsError;
  if (campaign_id) {
    const { data, error } = await supabaseClient.rpc(
      "get_conversation_summary_by_campaign",
      { p_workspace: workspaceId, campaign_id_prop: campaign_id },
    );
    chats = data;
    chatsError = error;
  } else {
    const { data, error } = await supabaseClient.rpc(
      "get_conversation_summary",
      { p_workspace: workspaceId },
    );
    chats = data;
    chatsError = error;
  }
  return { chats, chatsError };
}

