import Twilio from "twilio";
import Stripe from "stripe";
import {
  AuthSession,
  PostgrestError,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import {
  Audience,
  Call,
  Campaign,
  CampaignAudience,
  CampaignSchedule,
  Contact,
  OutreachAttempt,
  Script,
  User,
  WorkspaceData,
  WorkspaceNumbers,
} from "./types";
import { jwtDecode } from "jwt-decode";
import { data, json } from "@remix-run/node";
import { extractKeys, flattenRow } from "./utils";
import { NewKeyInstance } from "twilio/lib/rest/api/v2010/account/newKey";
import { MemberRole } from "~/components/Workspace/TeamMember";

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
    console.error("Error on function getUserWorkspaces: ", error);
  }

  return { data, error };
}

// THIS FUNCTION IS NOW DEPRECATED
export async function createNewWorkspaceDeprecated({
  supabaseClient,
  userId,
  name,
}: {
  supabaseClient: SupabaseClient<Database>;
  userId: string;
  name: string;
}) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .insert({ owner: userId, name })
    .select("id")
    .single();

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
    console.error("Error creating keys", error);
    throw error;
  }
}

export async function createSubaccount({
  workspace_id,
}: {
  workspace_id: string;
}) {
  const twilio = new Twilio.Twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );
  const account = await twilio.api.v2010.accounts
    .create({
      friendlyName: workspace_id,
    })
    .catch((error) => {
      console.error("Error creating subaccount", error);
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
      console.error(insertWorkspaceError);
      //return { data: null, error: insertWorkspaceError };
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
    console.error("Error in createNewWorkspace:", error);
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
    console.error(`Error on function getWorkspaceInfo: ${error.details}`);
  }

  return { data, error };
}
type WorkspaceInfoWithDetails = {
  workspace: WorkspaceData & { workspace_users: { role: MemberRole }[] };
  workspace_users: { role: MemberRole }[];
  campaigns: Partial<Campaign[]>;
  phoneNumbers: Partial<WorkspaceNumbers[]>;
  audiences: Partial<Audience[]>;
}

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


export async function getWorkspaceCampaigns({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data, error } = await supabaseClient
    .from("campaign")
    .select("*")
    .eq("workspace", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error on function getWorkspaceCampaigns");
  }

  return { data, error };
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
    console.error("Error on function getWorkspaceUsers", error);
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
    console.error("Error on function getWorkspacePhoneNumbers", error);
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
    console.error("Failed to join workspace", error);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function testAuthorize({
  supabaseClient,
  workspaceId,
  permission,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  permission: string;
}) {
  const { data, error } = await supabaseClient.rpc("authorize", {
    selected_workspace_id: workspaceId,
    requested_permission: permission as "workspace.delete" | "workspace.addUser" | "workspace.removeUser" | "workspace.call" | "workspace.addCampaign" | "workspace.addAudience" | "workspace.addContact" | "workspace.editUser" | "workspace.removeMedia",
  });


  return { data, error };
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
  if (!user ) {
    return null;
  }

  const {data: userRole, error: userRoleError} = await supabaseClient
    .from("workspace_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (userRoleError) {
    console.error("No User Role found on this workspace");
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
    console.error("Error updating user access time: ", updatedTimeError);
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

export async function forceTokenRefresh({
  supabaseClient,
  serverSession,
}: {
  supabaseClient: SupabaseClient<Database>;
  serverSession?: Session;
}) {
  const { data: refreshData, error: refreshError } = serverSession
    ? await supabaseClient.auth.refreshSession(serverSession)
    : await supabaseClient.auth.refreshSession();

  if (refreshError) {
    console.error("Error refreshing access token", refreshError);
    return { data: null, error: refreshError };
  }

  return { data: refreshData, error: null };
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

    const [updatedOutgoingResults, updatedIncomingResults] = await Promise.all([
      updatedOutgoing,
      updatedIncoming,
    ]);
  } catch (error) {
    console.error(error);
    return { error };
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

// Marked for deprecation
export async function endConferenceByUser({ user_id, supabaseClient, workspace_id }: { workspace_id: string, user_id: string, supabaseClient: SupabaseClient }) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data, key, token")
    .eq("id", workspace_id)
    .single();
  if (error || !data) {
    throw error || new Error("No workspace found")
  }
  const twilio = new Twilio.Twilio(
    data.twilio_data.sid,
    data.twilio_data.authToken,
  );
  if (!user_id) {
    throw new Error("User ID is required"); 
  }
  const conferences = await twilio.conferences.list({
    friendlyName: user_id,
    status: ["in-progress"],
  });

  await Promise.all(
    conferences.map(async (conf) => {
      try {
        await twilio.conferences(conf.sid).update({ status: "completed" });

        const { data, error } = await supabaseClient
          .from("call")
          .select("sid")
          .eq("conference_id", conf.sid);
        if (error) throw error;

        await Promise.all(
          data.map(async (call) => {
            try {
              await twilio
                .calls(call.sid)
                .update({ twiml: `<Response><Hangup/></Response>` });
            } catch (callError) {
              console.error(`Error updating call ${call.sid}:`, callError);
            }
          }),
        );
      } catch (confError) {
        console.error(`Error updating conference ${conf.sid}:`, confError);
      }
    }),
  );
}

export async function getWorkspaceScripts({ workspace, supabase }: { workspace: string, supabase: SupabaseClient }) {
  const { data, error } = await supabase
    .from("script")
    .select()
    .eq("workspace", workspace);
  if (error) console.error("Error fetching scripts", error);
  return data;
}

export function getRecordingFileNames(stepData) {
  if (!Array.isArray(stepData)) {
    console.warn("stepData is not an array");
    return [];
  }

  return stepData.reduce((fileNames, step) => {
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

export async function listMedia(supabaseClient: SupabaseClient, workspace: string) {
  const { data, error } = await supabaseClient.storage
    .from(`workspaceAudio`)
    .list(workspace);
  if (error) console.error(error);
  return data;
}

export async function getSignedUrls(supabaseClient: SupabaseClient, workspace_id: string, mediaNames: string[]) {
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
  supabaseClient: SupabaseClient<any, "public", any>,
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
type CampaignType =
  | "live_call"
  | "message"
  | "robocall"
  | "simple_ivr"
  | "complex_ivr";
interface CampaignData {
  id?: string;
  workspace: string;
  title: string;
  type: CampaignType;
  script_id?: number;
  audiences?: Array<{ audience_id: string; campaign_id: string }>;
  [key: string]: any;
}

interface CampaignDetails {
  campaign_id: string;
  script_id?: string;
  [key: string]: any;
}
export function getCampaignTableKey(type: CampaignType): string {
  switch (type) {
    case "live_call":
      return "live_campaign";
    case "message":
      return "message_campaign";
    case "robocall":
    case "simple_ivr":
    case "complex_ivr":
      return "ivr_campaign";
    default:
      throw new Error("Invalid campaign type");
  }
}

function cleanObject<T extends object>(obj: T): Partial<T> {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key as keyof T] = value;
    }
    return acc;
  }, {} as Partial<T>);
}

export async function updateCampaign({
  supabase,
  campaignData,
  campaignDetails,
}: {
  supabase: SupabaseClient;
  campaignData: CampaignData;
  campaignDetails: CampaignDetails;
}) {
  const {
    campaign_id: id,
    workspace,
    audiences,
    details,
    ...restCampaignData
  } = campaignData;

  if (!id) throw new Error("Campaign ID is required");
  campaignDetails.script_id = campaignData.script_id?.toString() || undefined;
  campaignDetails.body_text = campaignData.body_text || "";
  campaignDetails.message_media = campaignData.message_media || [];
  campaignDetails.voicedrop_audio = campaignData.voicedrop_audio || null;

  const cleanCampaignData = cleanObject({
    ...restCampaignData,
    campaign_audience: undefined,
    campaignDetails: undefined,
    mediaLinks: undefined,
    script: undefined,
    questions: undefined,
    created_at: undefined,
    disposition_options: undefined,
    audience: undefined,
    script_id: undefined,
    body_text: undefined,
    message_media: undefined,
    voicedrop_audio: undefined,
    is_active: Boolean(restCampaignData.is_active),
  });
  const tableKey = getCampaignTableKey(cleanCampaignData.type!);

  const cleanCampaignDetails =
    tableKey === "message_campaign"
      ? cleanObject({
        ...campaignDetails,
        mediaLinks: undefined,
        disposition_options: undefined,
        script: undefined,
        questions: undefined,
        created_at: undefined,
        script_id: undefined,
        voicedrop_audio: undefined,
      })
      : tableKey === "ivr_campaign"
        ? cleanObject({
          ...campaignDetails,
          mediaLinks: undefined,
          disposition_options: undefined,
          script: undefined,
          questions: undefined,
          created_at: undefined,
          body_text: undefined,
          message_media: undefined,
          step_data: undefined,
          voicedrop_audio: undefined,
          campaign_id: id,
        })
        : cleanObject({
          ...campaignDetails,
          mediaLinks: undefined,
          disposition_options: undefined,
          script: undefined,
          questions: undefined,
          created_at: undefined,
          body_text: undefined,
          message_media: undefined,
          step_data: undefined,
        });

  if (cleanCampaignData.script_id && !cleanCampaignDetails.script_id) {
    cleanCampaignDetails.script_id = cleanCampaignData.script_id;
    delete cleanCampaignData.script_id;
  }

  const campaign = await handleDatabaseOperation(
    async () => await supabase.from("campaign").update(cleanCampaignData).eq("id", id).select().single(),
    "Error updating campaign"
  );

  // First check if the record exists
  const { data: existingRecord } = await supabase
    .from(tableKey)
    .select()
    .eq("campaign_id", id)
    .single();

  let updatedCampaignDetails;
  if (existingRecord) {
    // Update if record exists
    updatedCampaignDetails = await handleDatabaseOperation(
      async () =>
        await supabase
          .from(tableKey)
          .update(cleanCampaignDetails)
          .eq("campaign_id", id)
          .select()
          .single(),
      "Error updating campaign details",
    );
  } else {
    // Insert if record doesn't exist
    updatedCampaignDetails = await handleDatabaseOperation(
      async () =>
        await supabase
          .from(tableKey)
          .insert({ ...cleanCampaignDetails, campaign_id: id })
          .select()
          .single(),
      "Error creating campaign details",
    );
  }

  return {
    campaign,
    campaignDetails: updatedCampaignDetails,
  };
}

export async function deleteCampaign({ supabase, campaignId }: { supabase: SupabaseClient, campaignId: string }) {
  const { error } = await supabase.from("campaign").delete().eq("id", campaignId);
  if (error) throw error;
}
export async function createCampaign({
  supabase,
  campaignData,
}: {
  supabase: SupabaseClient,
  campaignData: CampaignData,
}) {
  const { audiences, ...restCampaignData } = campaignData;

  const cleanCampaignData = cleanObject({
    ...restCampaignData,
    campaign_audience: undefined,
    campaignDetails: undefined,
    mediaLinks: undefined,
    script: undefined,
    questions: undefined,
    created_at: undefined,
    disposition_options: undefined,
    audience: undefined,
    script_id: undefined,
    body_text: undefined,
    message_media: undefined,
    voicedrop_audio: undefined,
    is_active: Boolean(restCampaignData.is_active),
  });

  let campaign;
  try {
    const { data, error } = await supabase
      .from("campaign")
      .insert(cleanCampaignData)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        // Handle duplicate campaign name
        const newCampaignName = `${campaignData.title} (Copy)`;
        const { data: retryData, error: retryError } = await supabase
          .from("campaign")
          .insert({ ...cleanCampaignData, title: newCampaignName, status: "draft" })
          .select()
          .single();

        if (retryError) throw retryError;
        campaign = retryData;
      } else {
        throw error;
      }
    } else {
      campaign = data;
    }
  } catch (error: any) {
    throw new Error(`Error creating campaign: ${error.message}`);
  }

  if (!cleanCampaignData.type) {
    throw new Error("Campaign type is required");
  }

  const tableKey = getCampaignTableKey(cleanCampaignData.type);

  const campaignDetails = {
    campaign_id: campaign.id,
    script_id: campaignData.script_id ? Number(campaignData.script_id) : null,
    body_text: campaignData.body_text || "",
    message_media: campaignData.message_media || [],
    voicedrop_audio: campaignData.voicedrop_audio || null,
    workspace: campaignData.workspace,
  };

  const cleanCampaignDetails =
    tableKey === "message_campaign"
      ? cleanObject({
        ...campaignDetails,
        mediaLinks: undefined,
        disposition_options: undefined,
        script: undefined,
        questions: undefined,
        created_at: undefined,
        script_id: undefined,
        voicedrop_audio: undefined,
      })
      : tableKey === "ivr_campaign"
        ? cleanObject({
          ...campaignDetails,
          mediaLinks: undefined,
          disposition_options: undefined,
          script: undefined,
          questions: undefined,
          created_at: undefined,
          body_text: undefined,
          message_media: undefined,
          step_data: undefined,
          voicedrop_audio: undefined,
        })
        : cleanObject({
          ...campaignDetails,
          mediaLinks: undefined,
          disposition_options: undefined,
          script: undefined,
          questions: undefined,
          created_at: undefined,
          body_text: undefined,
          message_media: undefined,
          step_data: undefined,
        });

  const { data: createdCampaignDetails, error: detailsError } = await supabase
    .from(tableKey)
    .insert(cleanCampaignDetails)
    .select()
    .single();

  if (detailsError) {
    console.error("Error creating campaign details:", detailsError);
    await supabase.from("campaign").delete().eq("id", campaign.id);
    throw new Error(`Error creating campaign details: ${detailsError.message}`);
  }

  return {
    campaign,
    campaignDetails: createdCampaignDetails,
  };
}
type ScriptUpdateProps = {
  supabase: SupabaseClient;
  scriptData: Script;
  saveAsCopy: boolean;
  campaignData: Campaign;
  created_by: string;
  created_at: string;
}
export async function updateOrCopyScript({
  supabase,
  scriptData,
  saveAsCopy,
  campaignData,
  created_by,
  created_at,
}: ScriptUpdateProps) {
  const { id, ...updateData } = scriptData;
  const { data: originalScript, error: fetchScriptError } = id
    ? await supabase.from("script").select().eq("id", id).single()
    : { data: null, error: null };
  let scriptOperation;
  const upsertData = {
    ...scriptData,
    name:
      saveAsCopy && originalScript?.name === updateData.name
        ? `${updateData.name} (Copy)`
        : updateData.name,
    ...(saveAsCopy || !id
      ? { updated_by: created_by, updated_at: created_at }
      : { created_by, created_at }),
  };

  if (saveAsCopy || !id) {
    delete upsertData.id;
    scriptOperation = supabase.from("script").insert(upsertData).select();
  } else {
    scriptOperation = supabase
      .from("script")
      .update(upsertData)
      .eq("id", id)
      .select();
  }
  const { data: updatedScript, error: scriptError } = await scriptOperation;
  if (scriptError) {
    if (scriptError.code === "23505") {
      console.error(scriptError);
      throw new Error(
        `A script with this name (${upsertData.name}) already exists in the workspace`,
      );
    }
    throw scriptError;
  }

  return updatedScript[0];
}

export async function updateCampaignScript({
  supabase,
  campaignId,
  scriptId,
  campaignType,
}) {
  let tableKey: "live_campaign" | "ivr_campaign";
  if (campaignType === "live_call" || !campaignType) tableKey = "live_campaign";
  else if (["robocall", "simple_ivr", "complex_ivr"].includes(campaignType))
    tableKey = "ivr_campaign";
  else throw new Error("Invalid campaign type for script update");

  const { error: scriptIdUpdateError } = await supabase
    .from(tableKey)
    .update({ script_id: scriptId })
    .eq("campaign_id", campaignId);

  if (scriptIdUpdateError) throw scriptIdUpdateError;
}

export const fetchBasicResults = async (
  supabaseClient: SupabaseClient,
  campaignId: string,
) => {
  const { data, error } = await supabaseClient.rpc("get_campaign_stats", {
    campaign_id_param: campaignId,
  });
  if (error) console.error("Error fetching basic results:", error);
  return data || [];
};

export const fetchCampaignCounts = async (supabaseClient: SupabaseClient, campaignId: string) => {
  const { count, error } = await supabaseClient
    .from("campaign_queue")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  const { count: callCount, error: callCountError } = await supabaseClient
    .from("outreach_attempt")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  if (error) {
    console.error("Error fetching campaign counts:", error);
  }
  if (callCountError) {
    console.error("Error fetching call counts:", callCountError);
  }

  return {
    callCount: count,
    completedCount: callCount,
  };
};
export const fetchCampaignData = async (
  supabaseClient: SupabaseClient,
  campaignId: string,
) => {
  const { data, error } = await supabaseClient
    .from("campaign")
    .select(
      `
      *,
      campaign_audience(*)
    `,
    )
    .eq("id", campaignId)
    .single();
  if (error) console.error("Error fetching campaign data:", error);
  return data;
};

export const fetchCampaignDetails = async (
  supabaseClient: SupabaseClient,
  campaignId: string | number,
  workspaceId: string,
  tableName: string,
) => {
  const { data, error } = await supabaseClient
    .from(tableName)
    .select()
    .eq("campaign_id", campaignId)
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      const { data: newCampaign, error: newCampaignError } =
        await supabaseClient
          .from(tableName)
          .insert({ campaign_id: campaignId, workspace: workspaceId })
          .select()
          .single();

      if (newCampaignError) {
        console.error(`Error creating new ${tableName}:`, newCampaignError);
        return null;
      }
      return newCampaign;
    }
    console.error(`Error fetching ${tableName}:`, error);
    return null;
  }
  return data;
};

export const fetchQueueCounts = async (supabaseClient: SupabaseClient<Database>, campaignId: string) => {
  const { error: fullCountError, count: fullCountCount } = await supabaseClient
    .from("campaign_queue")
    .select("*, contact!inner(*)", { count: "exact", head: true })
    .eq("campaign_id", Number(campaignId))
    .not('contact.phone', 'is', null)
    .neq('contact.phone', '')
    .limit(1);
  
  const { error: queuedCountError, count: queuedCountCount } = await supabaseClient
    .from("campaign_queue")
    .select("*, contact!inner(*)", { count: "exact", head: true })
    .eq("campaign_id", Number(campaignId))
    .eq('status', 'queued')
    .not('contact.phone', 'is', null)
    .neq('contact.phone', '')
    .limit(1);

  if (fullCountError) throw new Error(`Error fetching full count: ${fullCountError?.message || "Unknown error fetching full count"}`);
  if (queuedCountError) throw new Error(`Error fetching queued count: ${queuedCountError?.message || "Unknown error fetching queued count"}`);
  
  return {
    fullCount: fullCountCount,
    queuedCount: queuedCountCount,
  };
};  

export const fetchCampaignAudience = async (
  supabaseClient: SupabaseClient<Database>,
  campaignId: string,
  workspaceId: string,
) => {
  const scriptsPromise = supabaseClient
    .from("script")
    .select(`*`)
    .eq("workspace", workspaceId)

  const queuePromise = supabaseClient
    .from("campaign_queue")
    .select(`*, contact!inner(*)`, { count: "exact" })
    .eq("campaign_id", Number(campaignId))
    .not('contact.phone', 'is', null)
    .neq('contact.phone', '')
    .limit(25);

  const isQueuedCountPromise = supabaseClient
    .from("campaign_queue")
    .select(
      `id, contact_id, contact!inner(*)`, { count: "exact" })
    .eq('campaign_id', Number(campaignId))
    .eq('status', 'queued')
    .not('contact.phone', 'is', null)
    .neq('contact.phone', '')
    .limit(1);

  const [queueResult, isQueuedCount, scripts] = await Promise.all([
    queuePromise,
    isQueuedCountPromise,
    scriptsPromise
  ]);

  if (queueResult.error) throw new Error(`Error fetching queue data: ${queueResult.error.message}`);
  if (isQueuedCount.error) throw new Error(`Error fetching queued count: ${isQueuedCount.error.message}`);
  if (scripts.error) throw new Error(`Error fetching scripts: ${scripts.error.message}`);
  return {
    campaign_queue: queueResult.data,
    queue_count: isQueuedCount.count,
    total_count: queueResult.count,
    scripts: scripts.data
  };
};

export const fetchAdvancedCampaignDetails = async (
  supabaseClient: SupabaseClient<Database>,
  campaignId: string | number,
  campaignType: "live_call" | "message" | "robocall",
  workspaceId: string,
) => {
  let table,
    extraSelect = "";
  switch (campaignType) {
    case "live_call":
    case null:
      table = "live_campaign";
      extraSelect = ", script(*)";
      break;
    case "message":
      table = "message_campaign";
      break;
    case "robocall":
      table = "ivr_campaign";
      extraSelect = ", script(*)";
      break;
    default:
      throw new Error(`Invalid campaign type: ${campaignType}`);
  }

  const { data, error } = await supabaseClient
    .from(table)
    .select(`*${extraSelect}`)
    .eq("campaign_id", campaignId)
    .single();

  if (error)
    throw new Error(`Error fetching campaign details: ${error.message}`);

  if (campaignType === "message" && data?.message_media?.length > 0) {
    data.mediaLinks = await getSignedUrls(
      supabaseClient,
      workspaceId,
      data.message_media,
    );
  }

  return data;
};

export const findPotentialContacts = async (
  supabaseClient: SupabaseClient<Database>,
  phoneNumber: string,
  workspaceId: string,
) => {
  const fullNumber = phoneNumber.replace(/\D/g, "");
  const last10 = fullNumber.slice(-10);
  const last7 = fullNumber.slice(-7);
  const areaCode = last10.slice(0, 3);
  const data = await supabaseClient
    .from("contact")
    .select()
    .eq("workspace", workspaceId)
    .or(
      `phone.eq.${fullNumber},` +
      `phone.eq.+${fullNumber},` +
      `phone.eq.+1${fullNumber},` +
      `phone.eq.1${fullNumber},` +
      `phone.eq.(${areaCode}) ${last7},` +
      `phone.eq.(${areaCode})${last7},` +
      `phone.eq.${areaCode}-${last7},` +
      `phone.eq.${areaCode}.${last7},` +
      `phone.eq.(${areaCode}) ${last7.slice(0, 3)}-${last7.slice(3)},` +
      `phone.ilike.%${fullNumber},` +
      `phone.ilike.%+${fullNumber},` +
      `phone.ilike.%+1${fullNumber},` +
      `phone.ilike.%1${fullNumber},` +
      `phone.ilike.%(${areaCode})%${last7},` +
      `phone.ilike.%${areaCode}-%${last7},` +
      `phone.ilike.%${areaCode}.%${last7},` +
      `phone.ilike.%(${areaCode}) ${last7.slice(0, 3)}-${last7.slice(3)}%,` +
      `phone.ilike.${last10}%`,
    )
    .not("phone", "is", null)
    .neq("phone", "");
  return data;
};

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
export async function fetchCampaignsByType({
  supabaseClient,
  workspaceId,
  type,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  type: "message_campaign" | "ivr_campaign" | "live_campaign";
}) {
  const { data, error } = await supabaseClient
    .from(type)
    .select(`...campaign(title, id)`)
    .eq("workspace", workspaceId);
  if (error) {
    console.error(error);
  }
  return data;
}

export async function fetchContactData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  contact_id: number | string,
  contact_number: string,
) {
  let potentialContacts = [];
  let contact = null;
  let contactError = null;

  if (contact_number && !contact_id) {
    const { data: contacts } = await findPotentialContacts(
      supabaseClient,
      contact_number,
      workspaceId,
    );
    potentialContacts.push(...contacts || []);
  }

  if (contact_id) {
    const { data: findContact, error: findContactError } = await supabaseClient
      .from("contact")
      .select()
      .eq("workspace", workspaceId)
      .eq("id", contact_id)
      .single();

    if (findContactError) {
      contactError = findContactError;
    } else {
      contact = findContact;
    }
  }

  return { contact, potentialContacts, contactError };
}

export type OutreachExportData = {
  answered_at: string | null;
  campaign_id: number;
  contact_id: number;
  created_at: string;
  current_step: string | null;
  disposition: string | null;
  ended_at: string | null;
  id: number;
  result: Json;
  user_id: string | null;
  workspace: string;
  contact: Database['public']['Tables']['contact']['Row'];
  calls: { duration: number }[];
}[];

type WorkspaceUserData = {
  id: string;
  username: string;
  role: string;
}

interface ProcessedData {
  csvHeaders: string[];
  flattenedData: Record<string, any>[];
}

export async function fetchOutreachData(
  supabaseClient: SupabaseClient<Database>,
  campaignId: string | number
) {
  const { data, error } = await supabaseClient
    .from('outreach_attempt')
    .select(`
      *,
      contact:contact_id(*),
      calls:call!outreach_attempt_id(duration)
    `)
    .eq('campaign_id', campaignId);

  if (error) throw new Error('Error fetching data');
  return (data || []) as unknown as OutreachExportData;
}


export function processOutreachExportData(data: OutreachExportData[], users: WorkspaceUserData[]) {
  const { dynamicKeys, resultKeys, otherDataKeys } = extractKeys(data);
  let csvHeaders = [...dynamicKeys, ...otherDataKeys].map((header) =>
    header === "id"
      ? "attempt_id"
      : header === "contact_id"
        ? "callcaster_id"
        : header,
  );

  let flattenedData = data.map((row) => flattenRow(row, users));

  flattenedData.sort((a, b) => {
    if (a.callcaster_id < b.callcaster_id) return -1;
    if (a.callcaster_id > b.callcaster_id) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const mergedData: Record<string, any>[] = [];
  let currentGroup: Record<string, any> | null = null;

  flattenedData.forEach((row) => {
    if (
      !currentGroup ||
      row.callcaster_id !== currentGroup.callcaster_id ||
      new Date(row.created_at).getTime() - new Date(currentGroup.created_at).getTime() >
      12 * 60 * 60 * 1000
    ) {
      if (currentGroup) {
        mergedData.push(currentGroup);
      }
      currentGroup = { ...row };
    } else {
      Object.keys(row).forEach((key) => {
        if (row[key] != null && row[key] !== "" && currentGroup) {
          currentGroup[key] = row[key];
        }
      });

      // Special handling for call_duration - keep the longer duration
      if (row.call_duration > currentGroup.call_duration) {
        currentGroup.call_duration = row.call_duration;
      }
    }
  });

  if (currentGroup) {
    mergedData.push(currentGroup);
  }

  // Filter headers but ensure call_duration remains
  csvHeaders = csvHeaders.filter((header) =>
    typeof header === 'string' && (
      header === 'call_duration' ||
      mergedData.some((row) => row[header] != null && row[header] !== "")
    )
  );

  return { csvHeaders, flattenedData: mergedData };
}

export async function createStripeContact({
  supabaseClient,
  workspace_id,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspace_id: string;
}) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .select(
      `
      name,
      workspace_users!inner(
        role,
        user:user_id(
          id,
          username
        )
      )
    `,
    )
    .eq("id", workspace_id)
    .eq("workspace_users.role", "owner")
    .single();

  if (error) {
    console.error("Error fetching workspace data:", error);
    throw error;
  }

  if (!data || !data.workspace_users || data.workspace_users.length === 0) {
    throw new Error("No owner found for the workspace");
  }

  const ownerUser = data.workspace_users[0].user;
  if (!ownerUser) {
    throw new Error("No owner user found");
  }
  const ownerEmail = ownerUser?.username;
  if (!ownerEmail) {
    throw new Error("Owner user has no email or username");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20",
  });

  return await stripe.customers.create({
    name: data.name,
    email: ownerEmail,
  });
}

export async function meterEvent({
  supabaseClient,
  workspace_id,
  amount,
  type,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspace_id: string;
  amount: number;
  type: string;
}) {
  const {
    data,
    error,
  } = await supabaseClient
    .from("workspace")
    .select("stripe_id")
    .eq("id", workspace_id)
    .single();
  if (error || !data?.stripe_id) return;
  const stripe = new Stripe(process.env.STRIPE_API_KEY!);
  return await stripe.billing.meterEvents.create({
    event_name: type,
    payload: {
      value: amount,
      stripe_customer_id: data.stripe_id,
    },
  });
}

export const parseRequestData = async (request: Request) => {
  const contentType = request.headers.get("Content-Type");
  if (!contentType) return;
  if (contentType === "application/json") {
    return await request.json();
  } else if (contentType.startsWith("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    return Object.fromEntries(formData);
  }
  throw new Error("Unsupported content type");
};

export const handleError = (error: Error, message: string, status = 500) => {
  console.error(`${message}:`, error);
  return json({ error: message }, { status });
};

export const updateContact = async (supabaseClient: SupabaseClient<Database>, data: Partial<Contact>) => {
  if (!data.id) {
    throw new Error("Contact ID is required");
  }
  Object.keys(data).forEach(
    (key) => data[key] === undefined && delete data[key],
  );
  delete data.audience_id;

  const { data: update, error } = await supabaseClient
    .from("contact")
    .update(data)
    .eq("id", data.id)
    .select();

  if (error) throw error;
  if (!update || update.length === 0) throw new Error("Contact not found");

  return update[0];
};

export const createContact = async (
  supabaseClient: SupabaseClient,
  contactData: Partial<Contact>,
  audience_id: string,
  user_id: string,
) => {
  const { workspace, firstname, surname, phone, email, address } = contactData;
  const { data: insert, error } = await supabaseClient
    .from("contact")
    .insert({
      workspace,
      firstname,
      surname,
      phone,
      email,
      address,
      created_by: user_id,
    })
    .select();

  if (error) throw error;

  if (audience_id && insert) {
    const contactAudienceData = insert.map((contact) => ({
      contact_id: contact.id,
      audience_id,
    }));
    const { error: contactAudienceError } = await supabaseClient
      .from("contact_audience")
      .insert(contactAudienceData)
      .select();
    if (contactAudienceError) throw contactAudienceError;
  }

  return insert;
};

export const bulkCreateContacts = async (
  supabaseClient: SupabaseClient,
  contacts: Partial<Contact[]>,
  workspace_id: string,
  audience_id: string,
  user_id: string,
) => {
  const contactsWithWorkspace = contacts.map((contact) => ({
    ...contact,
    workspace: workspace_id,
    created_by: user_id,
  }));

  const { data: insert, error } = await supabaseClient
    .from("contact")
    .insert(contactsWithWorkspace)
    .select();

  if (error) throw error;

  const audienceMap = insert.map((contact) => ({
    contact_id: contact.id,
    audience_id,
  }));

  const { data: audience_insert, error: audience_insert_error } =
    await supabaseClient.from("contact_audience").insert(audienceMap).select();

  if (audience_insert_error) throw audience_insert_error;

  return { insert, audience_insert };
};

export async function getCampaignQueueById({ supabaseClient, campaign_id }: { supabaseClient: SupabaseClient<Database>, campaign_id: string }) {
  const { data, error } = await supabaseClient
    .from("campaign_queue")
    .select("*, contact(*)")
    .eq("campaign_id", campaign_id);
  if (error) throw error;
  return data;
}

async function handleDatabaseOperation<T>(
  operation: () => Promise<{ data: T; error: any }>,
  errorMessage: string,
): Promise<T> {
  const { data, error } = await operation();
  if (error) { throw new Error(`${errorMessage}: ${error.message}`); }
  return data;
}

async function fetchQueuedCalls(twilio: typeof Twilio, batchSize: number) {
  return await twilio.calls.list({
    status: "queued",
    limit: batchSize,
    pageSize: batchSize,
  });
}
async function fetchQueuedMessages(twilio: typeof Twilio, batchSize: number) {
  return await twilio.messages.list({
    status: "queued",
    limit: batchSize,
    pageSize: batchSize,
  });
}

async function cancelCallAndUpdateDB(twilio: typeof Twilio, supabase: SupabaseClient<Database>, call: { sid: string }) {
  try {
    const canceledCall = await twilio
      .calls(call.sid)
      .update({ status: "canceled" });
    await supabase.rpc("cancel_outreach_attempts", {
      in_call_sid: canceledCall.sid,
    });
    return canceledCall.sid;
  } catch (error) {
    throw new Error(`Error canceling call ${call.sid}: ${error.message}`);
  }
}
async function cancelMessageAndUpdateDB(twilio: typeof Twilio, supabase: SupabaseClient<Database>, message: { sid: string }) {
  try {
    const cancelledMessage = await twilio
      .messages(message.sid)
      .update({ status: "canceled" });
    await supabase.rpc("cancel_messages", {
      message_ids: cancelledMessage.sid,
    });
    return cancelledMessage.sid;
  } catch (error) {
    throw new Error(`Error canceling call ${message.sid}: ${error.message}`);
  }
}

async function processBatchCancellation(twilio, supabase, calls) {
  const results = await Promise.allSettled(
    calls.map((call) => cancelCallAndUpdateDB(twilio, supabase, call)),
  );

  return results.reduce(
    (acc, result) => {
      if (result.status === "fulfilled") {
        acc.canceledCalls.push(result.value);
      } else {
        acc.errors.push(result.reason.message);
      }
      return acc;
    },
    { canceledCalls: [], errors: [] },
  );
}
async function processBatchMessageCancellation(twilio, supabase, messages) {
  const results = await Promise.allSettled(
    messages.map((message) =>
      cancelMessageAndUpdateDB(twilio, supabase, message),
    ),
  );

  return results.reduce(
    (acc, result) => {
      if (result.status === "fulfilled") {
        acc.cancelledMessages.push(result.value);
      } else {
        acc.errors.push(result.reason.message);
      }
      return acc;
    },
    { cancelledMessages: [], errors: [] },
  );
}

export async function cancelQueuedCalls(twilio: typeof Twilio, supabase: SupabaseClient<Database>, batchSize = 100) {
  let allCanceledCalls = [] as string[];
  let allErrors = [] as string[];
  let hasMoreCalls = true;

  while (hasMoreCalls) {
    try {
      const calls = await fetchQueuedCalls(twilio, batchSize);

      if (calls.length === 0) {
        hasMoreCalls = false;
        break;
      }

      const { canceledCalls, errors } = await processBatchCancellation(
        twilio,
        supabase,
        calls,
      );

      allCanceledCalls = allCanceledCalls.concat(canceledCalls);
      allErrors = allErrors.concat(errors);

      hasMoreCalls = calls.length === batchSize;
    } catch (error: any) {
      allErrors.push(`Error retrieving calls: ${error.message}`);
      hasMoreCalls = false;
    }
  }

  return {
    canceledCalls: allCanceledCalls,
    errors: allErrors,
  };
}
export async function cancelQueuedMessages(twilio: typeof Twilio, supabase: SupabaseClient<Database>, batchSize = 100) {
  let allCanceledMessages = [] as string[];
  let allErrors = [] as string[];
  let hasMoreMessages = true;

  while (hasMoreMessages) {
    try {
      const messages = await fetchQueuedMessages(twilio, batchSize);

      if (messages.length === 0) {
        hasMoreMessages = false;
        break;
      }

      const { canceledMessages, errors } =
        await processBatchMessageCancellation(twilio, supabase, messages);

      allCanceledMessages = allCanceledMessages.concat(canceledMessages);
      allErrors = allErrors.concat(errors);

      hasMoreMessages = messages.length === batchSize;
    } catch (error) {
      allErrors.push(`Error retrieving calls: ${error.message}`);
      hasMoreMessages = false;
    }
  }
  return {
    canceledMessages: allCanceledMessages,
    errors: allErrors,
  };
}

export function checkSchedule(campaignData: Campaign) {
  if (!campaignData) return false;
  const { start_date, end_date, schedule } = campaignData;
  if (!schedule) return false;  
  const scheduleObject = typeof schedule === "string" ? JSON.parse(schedule) : schedule as unknown as CampaignSchedule;
  const now = new Date();
  const utcNow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds()
  ));

  if (!start_date || !end_date || !(utcNow > new Date(start_date) && utcNow < new Date(end_date))) {
    return false;
  }

  const currentDay = utcNow.getUTCDay();
  const daysOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] 
  const todaySchedule = scheduleObject[daysOfWeek[currentDay]];
  if (!todaySchedule.active) {
    return false;
  }

  const currentTime = utcNow.toISOString().slice(11, 16);
  return todaySchedule.intervals.some((interval: { start: string, end: string }) => {
    if (interval.end < interval.start) {
      return currentTime >= interval.start || currentTime < interval.end;
    }
    return currentTime >= interval.start && currentTime < interval.end;
  });
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
