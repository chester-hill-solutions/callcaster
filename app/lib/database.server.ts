import Twilio from "twilio";
import { PostgrestError, Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { Audience, WorkspaceData } from "./types";
import { jwtDecode } from "jwt-decode";

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
    console.log("Error on function getUserWorkspaces: ", error);
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
    const { error: insertWorkspaceUsersError } = await supabaseClient
      .from("workspace")
      .update({ twilio_data: account, key: newKey.sid, token: newKey.secret })
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
    console.log(`Error on function getWorkspaceInfo: ${error.details}`);
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
    console.log("Error on function getWorkspaceCampaigns");
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
    console.log("Error on function getWorkspaceUsers", error);
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
    console.log("Error on function getWorkspacePhoneNumbers", error);
  }
  return { data, error };
}

export async function addUserToWorkspace({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  return;
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
    console.log("No User Role found on this workspace");
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
    console.log("Error updating user access time: ", updatedTimeError);
  }

  return;
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
    console.log("Error refreshing access token", refreshError);
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
    const { data, error } = await supabaseClient
      .from("workspace")
      .select("twilio_data")
      .eq("id", workspaceId)
      .single();
    if (error) throw error;
    const { data: number, error: numberError } = await supabaseClient
      .from("workspace_number")
      .select()
      .eq("id", numberId)
      .single();
    if (numberError) throw numberError;
    const twilio = await createWorkspaceTwilioInstance({supabase: supabaseClient, workspace_id: workspaceId})
    const outgoingIds = await twilio.outgoingCallerIds.list({
      friendlyName: number.friendly_name,
    });
    outgoingIds.map(async (id) => {
      return await twilio.outgoingCallerIds(id.sid).remove();
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

export async function updateCampaign({
  supabase,
  campaignData = {},
  campaignDetails = {},
}) {
  const updateData = campaignData;
  delete updateData.campaign_audience;
  delete updateData.campaignDetails;
  delete updateData.mediaLinks;
  delete updateData.script;
  const id = campaignDetails.campaign_id
  delete updateData.campaign_id;
  delete updateData.questions;

  const { data: campaign, error: campaignError } = await supabase
    .from("campaign")
    .update(updateData)
    .eq("id", id)
    .eq("workspace", updateData.workspace)
    .select();
  if (campaignError) {
    if (campaignError.code === "23505") {
      throw new Error(
        "A campaign with this title already exists in the workspace",
      );
    }
    throw campaignError;
  }

  let tableKey: "live_campaign" | "message_campaign" | "ivr_campaign";
  if (campaignData?.type === "live_call" || !campaignData?.type)
    tableKey = "live_campaign";
  else if (campaignData.type === "message") tableKey = "message_campaign";
  else if (
    ["robocall", "simple_ivr", "complex_ivr"].includes(campaignData.type)
  )
    tableKey = "ivr_campaign";
  else throw new Error("Invalid campaign type");
  delete campaignDetails.mediaLinks;
  delete campaignDetails.script;
  const { data: updatedCampaignDetails, error: campaignDetailsError } =
    await supabase
      .from(tableKey)
      .update(campaignDetails)
      .eq("campaign_id", id)
      .select();

  if (campaignDetailsError) throw campaignDetailsError;

  return { campaign: campaign[0], campaignDetails: updatedCampaignDetails[0] };
}

export async function updateOrCopyScript({ supabase, scriptData, saveAsCopy, campaignData, created_by, created_at }) {
  
  const { id, ...updateData } = scriptData;
  const {data: originalScript, error: fetchScriptError} = id ? await supabase.from('script').select().eq('id', id) : {data: null, error: null};
  let scriptOperation;
  const upsertData = {
    ...scriptData,
    name: saveAsCopy && originalScript?.name === updateData.name ? `${updateData.name} (Copy)` : updateData.name,
    ...(saveAsCopy || !id ? {updated_by: created_by, updated_at: created_at} : {created_by, created_at})
  }

  if (saveAsCopy || !id) {
    delete upsertData.id
    scriptOperation = supabase
      .from("script")
      .insert(upsertData)
      .select();
      
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
      console.log(scriptError)
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
  campaignType
}) {
  let tableKey: "live_campaign" | "ivr_campaign";
  if (campaignType === "live_call" || !campaignType) tableKey = "live_campaign";
  else if (["robocall", "simple_ivr", "complex_ivr"].includes(campaignType)) tableKey = "ivr_campaign";
  else throw new Error("Invalid campaign type for script update");

  const { error: scriptIdUpdateError } = await supabase
    .from(tableKey)
    .update({ script_id: scriptId })
    .eq("campaign_id", campaignId);

  if (scriptIdUpdateError) throw scriptIdUpdateError;
}

export const fetchBasicResults = async (supabaseClient, campaignId, headers) => {
  const { data, error } = await supabaseClient.rpc(
    "get_basic_results",
    { campaign_id_param: campaignId },
    { headers }
  );
  if (error) console.error('Error fetching basic results:', error);
  return data || [];
};

export const fetchCampaignData = async (supabaseClient, campaignId) => {
  const { data, error } = await supabaseClient
    .from("campaign")
    .select(`
      type,
      dial_type,
      title,
      campaign_audience(*)
    `)
    .eq("id", campaignId)
    .single();
  if (error) console.error('Error fetching campaign data:', error);
  return data;
};

export const fetchCampaignDetails = async (supabaseClient, campaignId, workspaceId, tableName) => {
  const { data, error } = await supabaseClient
    .from(tableName)
    .select()
    .eq("campaign_id", campaignId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      const { data: newCampaign, error: newCampaignError } = await supabaseClient
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

export const fetchCampaignWithAudience = async (supabaseClient, campaignId) => {
  const { data, error } = await supabaseClient
    .from("campaign")
    .select(`*, campaign_audience(*)`)
    .eq("id", campaignId)
    .single();

  if (error) throw new Error(`Error fetching campaign data: ${error.message}`);
  return data;
};


export const fetchAdvancedCampaignDetails = async (supabaseClient, campaignId, campaignType, workspaceId) => {
  let table, extraSelect = '';
  switch (campaignType) {
    case "live_call":
    case null:
      table = "live_campaign";
      extraSelect = ', script(*)';
      break;
    case "message":
      table = "message_campaign";
      break;
    case "robocall":
    case "simple_ivr":
    case "complex_ivr":
      table = "ivr_campaign";
      extraSelect = ', script(*)';
      break;
    default:
      throw new Error(`Invalid campaign type: ${campaignType}`);
  }

  const { data, error } = await supabaseClient
    .from(table)
    .select(`*${extraSelect}`)
    .eq("campaign_id", campaignId)
    .single();

  if (error) throw new Error(`Error fetching campaign details: ${error.message}`);

  if (campaignType === "message" && data?.message_media?.length > 0) {
    data.mediaLinks = await getSignedUrls(supabaseClient, workspaceId, data.message_media);
  }

  return data;
};
