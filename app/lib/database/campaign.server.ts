/**
 * Campaign-related database functions
 */
import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import {
  Campaign,
  CampaignSchedule,
  Script,
  Contact,
} from "../types";
import { logger } from "../logger.server";
import { getSignedUrls } from "./workspace.server";
import { extractKeys, flattenRow } from "../utils";

export type CampaignType =
  | "live_call"
  | "message"
  | "robocall"
  | "simple_ivr"
  | "complex_ivr";

export interface CampaignData {
  id?: string;
  workspace: string;
  title: string;
  type: CampaignType;
  script_id?: number;
  audiences?: Array<{ audience_id: string; campaign_id: string }>;
  [key: string]: unknown;
}

export interface CampaignDetails {
  campaign_id: string;
  script_id?: string;
  [key: string]: unknown;
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

async function handleDatabaseOperation<T>(
  operation: () => Promise<{ data: T; error: PostgrestError | null }>,
  errorMessage: string,
): Promise<T> {
  const { data, error } = await operation();
  if (error) {
    throw new Error(`${errorMessage}: ${error.message}`);
  }
  return data;
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
    logger.error("Error on function getWorkspaceCampaigns", error);
  }

  return { data, error };
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
    async () =>
      await supabase
        .from("campaign")
        .update(cleanCampaignData)
        .eq("id", id)
        .select()
        .single(),
    "Error updating campaign",
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

export async function deleteCampaign({
  supabase,
  campaignId,
}: {
  supabase: SupabaseClient;
  campaignId: string;
}) {
  const { error } = await supabase.from("campaign").delete().eq("id", campaignId);
  if (error) throw error;
}

export async function createCampaign({
  supabase,
  campaignData,
}: {
  supabase: SupabaseClient;
  campaignData: CampaignData;
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
          .insert({
            ...cleanCampaignData,
            title: newCampaignName,
            status: "draft",
          })
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Error creating campaign: ${errorMessage}`);
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
    logger.error("Error creating campaign details:", detailsError);
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
};

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
      logger.error(scriptError);
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
}: {
  supabase: SupabaseClient;
  campaignId: string;
  scriptId: number;
  campaignType: string;
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
  if (error) logger.error("Error fetching basic results:", error);
  return data || [];
};

export const fetchCampaignCounts = async (
  supabaseClient: SupabaseClient,
  campaignId: string,
) => {
  const { count, error } = await supabaseClient
    .from("campaign_queue")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  const { count: callCount, error: callCountError } = await supabaseClient
    .from("outreach_attempt")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  if (error) {
    logger.error("Error fetching campaign counts:", error);
  }
  if (callCountError) {
    logger.error("Error fetching call counts:", callCountError);
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
  if (error) logger.error("Error fetching campaign data:", error);
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
        logger.error(`Error creating new ${tableName}:`, newCampaignError);
        return null;
      }
      return newCampaign;
    }
    logger.error(`Error fetching ${tableName}:`, error);
    return null;
  }
  return data;
};

export const fetchQueueCounts = async (
  supabaseClient: SupabaseClient<Database>,
  campaignId: string,
) => {
  const { error: fullCountError, count: fullCountCount } = await supabaseClient
    .from("campaign_queue")
    .select("*, contact!inner(*)", { count: "exact", head: true })
    .eq("campaign_id", Number(campaignId))
    .not("contact.phone", "is", null)
    .neq("contact.phone", "")
    .limit(1);

  const { error: queuedCountError, count: queuedCountCount } =
    await supabaseClient
      .from("campaign_queue")
      .select("*, contact!inner(*)", { count: "exact", head: true })
      .eq("campaign_id", Number(campaignId))
      .eq("status", "queued")
      .not("contact.phone", "is", null)
      .neq("contact.phone", "")
      .limit(1);

  if (fullCountError)
    throw new Error(
      `Error fetching full count: ${fullCountError?.message || "Unknown error fetching full count"}`,
    );
  if (queuedCountError)
    throw new Error(
      `Error fetching queued count: ${queuedCountError?.message || "Unknown error fetching queued count"}`,
    );

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
    .eq("workspace", workspaceId);

  const queuePromise = supabaseClient
    .from("campaign_queue")
    .select(`*, contact!inner(*)`, { count: "exact" })
    .eq("campaign_id", Number(campaignId))
    .not("contact.phone", "is", null)
    .neq("contact.phone", "")
    .limit(25);

  const isQueuedCountPromise = supabaseClient
    .from("campaign_queue")
    .select(`id, contact_id, contact!inner(*)`, { count: "exact" })
    .eq("campaign_id", Number(campaignId))
    .eq("status", "queued")
    .not("contact.phone", "is", null)
    .neq("contact.phone", "")
    .limit(1);

  const [queueResult, isQueuedCount, scripts] = await Promise.all([
    queuePromise,
    isQueuedCountPromise,
    scriptsPromise,
  ]);

  if (queueResult.error)
    throw new Error(`Error fetching queue data: ${queueResult.error.message}`);
  if (isQueuedCount.error)
    throw new Error(
      `Error fetching queued count: ${isQueuedCount.error.message}`,
    );
  if (scripts.error)
    throw new Error(`Error fetching scripts: ${scripts.error.message}`);
  return {
    campaign_queue: queueResult.data,
    queue_count: isQueuedCount.count,
    total_count: queueResult.count,
    scripts: scripts.data,
  };
};

export const fetchAdvancedCampaignDetails = async (
  supabaseClient: SupabaseClient<Database>,
  campaignId: string | number,
  campaignType: "live_call" | "message" | "robocall",
  workspaceId: string,
) => {
  let table, extraSelect = "";
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

  if (error) throw new Error(`Error fetching campaign details: ${error.message}`);

  if (campaignType === "message" && data?.message_media?.length > 0) {
    data.mediaLinks = await getSignedUrls(
      supabaseClient,
      workspaceId,
      data.message_media,
    );
  }

  return data;
};

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
    logger.error(error);
  }
  return data;
}

export async function getCampaignQueueById({
  supabaseClient,
  campaign_id,
}: {
  supabaseClient: SupabaseClient<Database>;
  campaign_id: string;
}) {
  const { data, error } = await supabaseClient
    .from("campaign_queue")
    .select("*, contact(*)")
    .eq("campaign_id", campaign_id);
  if (error) throw error;
  return data;
}

export function checkSchedule(campaignData: Campaign) {
  if (!campaignData) return false;
  const { start_date, end_date, schedule } = campaignData;
  if (!schedule) return false;
  const scheduleObject =
    typeof schedule === "string"
      ? JSON.parse(schedule)
      : (schedule as unknown as CampaignSchedule);
  const now = new Date();
  const utcNow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
    ),
  );

  if (
    !start_date ||
    !end_date ||
    !(utcNow > new Date(start_date) && utcNow < new Date(end_date))
  ) {
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
  const todaySchedule = scheduleObject[daysOfWeek[currentDay]];
  if (!todaySchedule.active) {
    return false;
  }

  const currentTime = utcNow.toISOString().slice(11, 16);
  return todaySchedule.intervals.some(
    (interval: { start: string; end: string }) => {
      if (interval.end < interval.start) {
        return currentTime >= interval.start || currentTime < interval.end;
      }
      return currentTime >= interval.start && currentTime < interval.end;
    },
  );
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
  contact: Database["public"]["Tables"]["contact"]["Row"];
  calls: { duration: number }[];
}[];

type WorkspaceUserData = {
  id: string;
  username: string;
  role: string;
};

export async function fetchOutreachData(
  supabaseClient: SupabaseClient<Database>,
  campaignId: string | number,
) {
  const { data, error } = await supabaseClient
    .from("outreach_attempt")
    .select(`
      *,
      contact:contact_id(*),
      calls:call!outreach_attempt_id(duration)
    `)
    .eq("campaign_id", campaignId);

  if (error) throw new Error("Error fetching data");
  return (data || []) as unknown as OutreachExportData;
}

export function processOutreachExportData(
  data: OutreachExportData[],
  users: WorkspaceUserData[],
) {
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
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });

  const mergedData: Record<string, unknown>[] = [];
  let currentGroup: Record<string, unknown> | null = null;

  flattenedData.forEach((row) => {
    if (
      !currentGroup ||
      row.callcaster_id !== currentGroup.callcaster_id ||
      new Date(row.created_at).getTime() -
        new Date(currentGroup.created_at).getTime() >
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
  csvHeaders = csvHeaders.filter(
    (header) =>
      typeof header === "string" &&
      (header === "call_duration" ||
        mergedData.some(
          (row) => row[header] != null && row[header] !== "",
        )),
  );

  return { csvHeaders, flattenedData: mergedData };
}

