import Twilio from "twilio";
import Stripe from "stripe";
import { PostgrestError, Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  Audience,
  Campaign,
  CampaignAudience,
  Contact,
  WorkspaceData,
  WorkspaceNumbers,
} from "./types";
import { jwtDecode } from "jwt-decode";
import { json } from "@remix-run/node";
import { extractKeys, flattenRow } from "./utils";

export async function getUserWorkspaces({
  supabaseClient,
}: {
  supabaseClient: SupabaseClient<Database>;
}) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  // console.log("Session? ", session);
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

export async function createKeys({ workspace_id, sid, token }) {
  const twilio = new Twilio.Twilio(sid, token);
  try {
    const newKey = await twilio.newKeys.create({ friendlyName: workspace_id });
    return newKey;
  } catch (error) {
    console.error("Error creating keys", error);
    throw error;
  }
}

export async function createSubaccount({ workspace_id }) {
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
      workspace_id: insertWorkspaceData,
    });

    if (!account) {
      throw new Error("Failed to create Twilio subaccount");
    }

    const newKey = await createKeys({
      workspace_id: insertWorkspaceData,
      sid: account.sid,
      token: account.authToken,
    });
    if (!newKey) {
      throw new Error("Failed to create Twilio API keys");
    }

    const newStripeCustomer = await createStripeContact({
      supabaseClient,
      workspace_id: insertWorkspaceData,
    });

    const { error: insertWorkspaceUsersError } = await supabaseClient
      .from("workspace")
      .update({
        twilio_data: account,
        key: newKey.sid,
        token: newKey.secret,
        stripe_id: newStripeCustomer.id,
      })
      .eq("id", insertWorkspaceData);
    if (insertWorkspaceUsersError) {
      throw insertWorkspaceUsersError;
    }

    return { data: insertWorkspaceData, error: null };
  } catch (error) {
    console.error("Error in createNewWorkspace:", error);
    return {
      data: null,
      error: error.message || "An unexpected error occurred",
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

export async function getWorkspaceCampaigns({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data, error } = await supabaseClient
    .rpc("get_campaigns_by_workspace", { workspace_id: workspaceId })
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
  // console.log("INSIDE FUNC:", data);
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
    requested_permission: permission,
  });
  console.log("\nXXXXXXXXXXXXXXXXXXXXXXXXX");
  console.log("Data: ", data);
  console.log("Error: ", error);
  console.log("XXXXXXXXXXXXXXXXXXXXXXXXX");

  return { data, error };
}

export function getUserRole({ serverSession, workspaceId }) {
  if (serverSession == null || serverSession.access_token == null) {
    return null;
  }

  const jwt = jwtDecode(serverSession.access_token);
  const userRole = jwt["user_workspace_roles"]?.find(
    (workspaceRoleObj) => workspaceRoleObj.workspace_id === workspaceId,
  )?.role;

  // console.log("USER ROLE: ", userRole);
  if (userRole == null) {
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
  serverSession: Session;
}) {
  // const refreshToken = serverSession.refresh_token;
  const { data: refreshData, error: refreshError } =
    await supabaseClient.auth.refreshSession();

  if (refreshError) {
    console.error("Error refreshing access token", refreshError);
    return { data: null, error: refreshError };
  }

  console.log("\nREFRESH");
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
  if (!number) return;
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

export async function endConferenceByUser({ user_id, supabaseClient }) {
  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data, key, token")
    .eq("id", workspace_id)
    .single();
  const twilio = new Twilio.Twilio(
    data.twilio_data.sid,
    data.twilio_data.authToken,
  );

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

export async function getWorkspaceScripts({ workspace, supabase }) {
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

export async function listMedia(supabaseClient, workspace) {
  const { data, error } = await supabaseClient.storage
    .from(`workspaceAudio`)
    .list(workspace);
  if (error) console.error(error);
  return data;
}

export async function getSignedUrls(supabaseClient, workspace_id, mediaNames) {
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
function getCampaignTableKey(type: CampaignType): string {
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
    ...restCampaignData
  } = campaignData;

  if (!id) throw new Error("Campaign ID is required");
  campaignDetails.script_id = parseInt(campaignData.script_id) || null;
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
  });
  const tableKey = getCampaignTableKey(cleanCampaignData.type);

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
          voicedrop_audio: undefined
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

  if (cleanCampaignData.script_id && !cleanCampaignDetails.script_id) {
    cleanCampaignDetails.script_id = cleanCampaignData.script_id;
    delete cleanCampaignData.script_id;
  }

  const campaign = await handleDatabaseOperation(
    () =>
      supabase
        .from("campaign")
        .update(cleanCampaignData)
        .eq("id", id)
        .eq("workspace", workspace)
        .select()
        .single(),
    "Error updating campaign",
  );

  //tableKey === "message_campaign"
  const updatedCampaignDetails = await handleDatabaseOperation(
    () =>
      supabase
        .from(tableKey)
        .update(cleanCampaignDetails)
        .eq("campaign_id", id)
        .select()
        .single(),
    "Error updating campaign details",
  );

  let audienceUpdateResult = null;
  if (audiences) {
    audienceUpdateResult = await updateCampaignAudiences(
      supabase,
      id,
      audiences,
    );
  }

  return {
    campaign,
    campaignDetails: updatedCampaignDetails,
    audienceChanges: audienceUpdateResult,
  };
}

export async function updateOrCopyScript({
  supabase,
  scriptData,
  saveAsCopy,
  campaignData,
  created_by,
  created_at,
}) {
  const { id, ...updateData } = scriptData;
  const { data: originalScript, error: fetchScriptError } = id
    ? await supabase.from("script").select().eq("id", id)
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

export const fetchCampaignWithAudience = async (
  supabaseClient: SupabaseClient<Database>,
  campaignId: string,
) => {
  const { data, error } = await supabaseClient
    .from("campaign")
    .select(`*, campaign_audience(*)`)
    .eq("id", campaignId)
    .single();
  if (error) throw new Error(`Error fetching campaign data: ${error.message}`);
  return data;
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
    potentialContacts = contacts;
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

export async function fetchOutreachData(
  supabaseClient: SupabaseClient<Database>,
  campaignId: string | number,
) {
  const { data, error } = await supabaseClient
    .from("outreach_attempt")
    .select(`*, contact(*)`)
    .eq("campaign_id", campaignId);

  if (error) {
    console.error("Error fetching data:", error);
    throw new Error("Error fetching data");
  }

  return data;
}

export function processOutreachExportData(data, users) {
  const { dynamicKeys, resultKeys, otherDataKeys } = extractKeys(data);
  let csvHeaders = [...dynamicKeys, ...resultKeys, ...otherDataKeys].map(
    (header) =>
      header === "id"
        ? "attempt_id"
        : header === "contact_id"
          ? "callcaster_id"
          : header,
  );

  const flattenedData = data.map((row) => flattenRow(row, users));

  csvHeaders = csvHeaders.filter((header) =>
    flattenedData.some((row) => row[header] != null && row[header] !== ""),
  );

  return { csvHeaders, flattenedData };
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

  const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
    apiVersion: "2020-08-27",
  });

  //console.log("Creating Stripe customer for:", data.name, ownerUser.username);

  return await stripe.customers.create({
    name: data.name,
    email: ownerUser.username,
  });
}

export async function meterEvent({
  supabaseClient,
  workspace_id,
  amount,
  type,
}) {
  const {
    data: { stripe_id },
    error,
  } = await supabaseClient
    .from("workspace")
    .select("stripe_id")
    .eq("id", workspace_id)
    .single();
  const stripe = new Stripe(process.env.STRIPE_API_KEY!);
  return await stripe.billing.meterEvents.create({
    event_name: type,
    payload: {
      value: amount,
      stripe_customer_id: stripe_id,
    },
  });
}

export const parseRequestData = async (request) => {
  const contentType = request.headers.get("Content-Type");
  if (contentType === "application/json") {
    return await request.json();
  } else if (contentType.startsWith("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    return Object.fromEntries(formData);
  }
  throw new Error("Unsupported content type");
};

export const handleError = (error, message, status = 500) => {
  console.error(`${message}:`, error);
  return json({ error: message }, { status });
};

export const updateContact = async (supabaseClient, data) => {
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

export async function getCampaignQueueById({ supabaseClient, campaign_id }) {
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
  if (error) throw new Error(`${errorMessage}: ${error.message}`);
  return data;
}

async function updateCampaignAudiences(
  supabase: SupabaseClient,
  campaignId: string,
  newAudiences: Array<{ audience_id: string; campaign_id: string }>,
) {
  const existing = await handleDatabaseOperation(
    () =>
      supabase.from("campaign_audience").select().eq("campaign_id", campaignId),
    "Error fetching existing campaign audience",
  );
  const toDelete = existing.filter(
    (row) =>
      !newAudiences.some((newRow) => newRow.audience_id === row.audience_id),
  );
  const toAdd = newAudiences.filter(
    (newRow) => !existing.some((row) => row.audience_id === newRow.audience_id),
  );

  const addPromise =
    toAdd.length > 0
      ? handleDatabaseOperation(
          () =>
            supabase
              .from("campaign_audience")
              .upsert(toAdd, { onConflict: ["audience_id", "campaign_id"] })
              .select(),
          "Error adding campaign audience",
        )
      : Promise.resolve([]);

  const deletePromise =
    toDelete.length > 0
      ? handleDatabaseOperation(
          () =>
            supabase
              .from("campaign_audience")
              .delete()
              .in(
                "audience_id",
                toDelete.map((row) => row.audience_id),
              )
              .eq("campaign_id", campaignId)
              .select(),
          "Error deleting campaign audience",
        )
      : Promise.resolve([]);

  const [added, deleted] = await Promise.all([addPromise, deletePromise]);

  return { added, deleted };
}
async function fetchQueuedCalls(twilio, batchSize) {
  return await twilio.calls.list({
    status: "queued",
    limit: batchSize,
    pageSize: batchSize,
  });
}
async function fetchQueuedMessages(twilio, batchSize) {
  return await twilio.messages.list({
    status: "queued",
    limit: batchSize,
    pageSize: batchSize,
  });
}

async function cancelCallAndUpdateDB(twilio, supabase, call) {
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
async function cancelMessageAndUpdateDB(twilio, supabase, message) {
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

export async function cancelQueuedCalls(twilio, supabase, batchSize = 100) {
  let allCanceledCalls = [];
  let allErrors = [];
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
    } catch (error) {
      allErrors.push(`Error retrieving calls: ${error.message}`);
      hasMoreCalls = false;
    }
  }

  return {
    canceledCalls: allCanceledCalls,
    errors: allErrors,
  };
}
export async function cancelQueuedMessages(twilio, supabase, batchSize = 100) {
  let allCanceledMessages = [];
  let allErrors = [];
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

export function checkSchedule(
  campaignData: Campaign & { campaign_audience: CampaignAudience[] },
) {
  const { start_date, end_date, schedule } = campaignData;
  const now = new Date();
  const utcNow = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 
                          now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
  
  if (!(utcNow > new Date(start_date) && utcNow < new Date(end_date))) {
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
  ];
  
  if (!schedule || !Object.keys(schedule).length) return false;
  
  const todaySchedule = schedule[daysOfWeek[currentDay]];
  if (!todaySchedule.active) {
    return false;
  }
  
  const currentTime = utcNow.toISOString().slice(11, 16); // Get time in HH:MM format
  
  return todaySchedule.intervals.some((interval) => {
    if (interval.end < interval.start) {
      return currentTime >= interval.start || currentTime < interval.end;
    }
    return currentTime >= interval.start && currentTime < interval.end;
  });
}
