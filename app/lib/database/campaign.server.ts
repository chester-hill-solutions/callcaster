/**
 * Campaign-related database functions
 */
import { eq, inArray } from "drizzle-orm";
import type { Database, Json } from "@/lib/db-types";
import {
  Campaign,
  CampaignSchedule,
  Script,
  Contact,
} from "../types";
import { logger } from "../logger.server";
import { fetchCampaignQueueWithContacts } from "../campaign-queue-search.server";
import { campaign as campaignTable, script as scriptTable } from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

export type CampaignType =
  | "live_call"
  | "message"
  | "robocall"
  | "simple_ivr"
  | "complex_ivr";

/** @deprecated Subtype tables removed — kept for callers still passing legacy table keys. */
export type LegacyCampaignTableKey = "live_campaign" | "message_campaign" | "ivr_campaign";

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

const IVR_CAMPAIGN_TYPES = ["robocall", "simple_ivr", "complex_ivr"] as const;

export function campaignTypesForLegacyTableKey(
  tableKey: LegacyCampaignTableKey,
): CampaignType[] {
  switch (tableKey) {
    case "live_campaign":
      return ["live_call"];
    case "message_campaign":
      return ["message"];
    case "ivr_campaign":
      return [...IVR_CAMPAIGN_TYPES];
    default:
      throw new Error("Invalid campaign table key");
  }
}

/** @deprecated Use unified `campaign` row — maps type to legacy table name for transitional callers. */
export function getCampaignTableKey(type: CampaignType): LegacyCampaignTableKey {
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

function buildUnifiedCampaignFields(
  campaignData: CampaignData,
  campaignDetails: CampaignDetails,
): Record<string, unknown> {
  return cleanObject({
    script_id: campaignData.script_id ? Number(campaignData.script_id) : undefined,
    body_text: campaignData.body_text ?? campaignDetails.body_text ?? "",
    message_media: campaignData.message_media ?? campaignDetails.message_media ?? [],
    voicedrop_audio: campaignData.voicedrop_audio ?? campaignDetails.voicedrop_audio ?? null,
    disposition_options: campaignDetails.disposition_options,
    live_questions: campaignDetails.questions ?? campaignDetails.live_questions,
  });
}

function stripCampaignMetaFields(rest: Record<string, unknown>): Record<string, unknown> {
  return cleanObject({
    ...rest,
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
    live_questions: undefined,
    is_active: Boolean(rest.is_active),
  });
}

export async function getWorkspaceCampaigns({
  workspaceId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  tdb?: TenantDb;
  /** @deprecated ignored — use workspaceId + tdb */
  null?: never;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  try {
    const data = await tdb.campaign.findMany({
      orderBy: (c, { desc }) => [desc(c.created_at)],
    });
    return { data, error: null };
  } catch (error) {
    logger.error("Error on function getWorkspaceCampaigns", error);
    return { data: null, error: error as Error };
  }
}

export async function updateCampaign({
  campaignData,
  campaignDetails,
  tdb: tdbIn,
}: {
  campaignData: CampaignData;
  campaignDetails: CampaignDetails;
  tdb?: TenantDb;
  /** @deprecated ignored */
  client?: never;
}) {
  const {
    campaign_id: id,
    workspace,
    audiences,
    details,
    ...restCampaignData
  } = campaignData;

  if (!id) throw new Error("Campaign ID is required");
  if (!workspace) throw new Error("Workspace is required");

  campaignDetails.script_id = campaignData.script_id?.toString() || undefined;
  campaignDetails.body_text = campaignData.body_text || "";
  campaignDetails.message_media = campaignData.message_media || [];
  campaignDetails.voicedrop_audio = campaignData.voicedrop_audio || null;

  const tdb = tdbIn ?? createTenantDb(workspace);
  const unifiedFields = buildUnifiedCampaignFields(campaignData, campaignDetails);
  const cleanCampaignData = {
    ...stripCampaignMetaFields(restCampaignData as Record<string, unknown>),
    ...unifiedFields,
  };

  const [updatedCampaign] = await tdb.campaign.update({
    set: cleanCampaignData,
    where: eq(campaignTable.id, Number(id)),
  });

  if (!updatedCampaign) {
    throw new Error("Error updating campaign: row not found");
  }

  return {
    campaign: updatedCampaign,
    campaignDetails: toLegacyCampaignDetails(updatedCampaign),
  };
}

export async function deleteCampaign({
  workspaceId,
  campaignId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  tdb?: TenantDb;
  /** @deprecated ignored */
  client?: never;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  await tdb.campaign.delete({
    where: eq(campaignTable.id, Number(campaignId)),
  });
}

export async function createCampaign({
  campaignData,
  tdb: tdbIn,
}: {
  campaignData: CampaignData;
  tdb?: TenantDb;
  /** @deprecated ignored */
  client?: never;
}) {
  const { audiences, ...restCampaignData } = campaignData;
  const workspaceId = campaignData.workspace;
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  const unifiedFields = buildUnifiedCampaignFields(campaignData, {
    campaign_id: "",
    body_text: campaignData.body_text as string | undefined,
    message_media: campaignData.message_media as string[] | undefined,
    voicedrop_audio: campaignData.voicedrop_audio as string | null | undefined,
    disposition_options: campaignData.disposition_options,
    questions: campaignData.questions,
  });

  const cleanCampaignData = {
    ...stripCampaignMetaFields(restCampaignData as Record<string, unknown>),
    ...unifiedFields,
  };

  if (!cleanCampaignData.type) {
    throw new Error("Campaign type is required");
  }

  let createdCampaign;
  try {
    [createdCampaign] = await tdb.campaign.insert(cleanCampaignData);
  } catch (error: unknown) {
    const pgError = error as { code?: string; message?: string };
    if (pgError.code === "23505") {
      const newCampaignName = `${campaignData.title} (Copy)`;
      try {
        [createdCampaign] = await tdb.campaign.insert({
          ...cleanCampaignData,
          title: newCampaignName,
          status: "draft",
        });
      } catch (retryError: unknown) {
        const retryMessage =
          retryError instanceof Error ? retryError.message : "Unknown error";
        throw new Error(`Error creating campaign: ${retryMessage}`);
      }
    } else {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error creating campaign: ${errorMessage}`);
    }
  }

  if (!createdCampaign) {
    throw new Error("Error creating campaign: insert returned no row");
  }

  return {
    campaign: createdCampaign,
    campaignDetails: toLegacyCampaignDetails(createdCampaign),
  };
}

function toLegacyCampaignDetails(row: typeof campaignTable.$inferSelect) {
  return {
    campaign_id: row.id,
    script_id: row.script_id,
    body_text: row.body_text,
    message_media: row.message_media,
    voicedrop_audio: row.voicedrop_audio,
    disposition_options: row.disposition_options,
    questions: row.live_questions,
    workspace: row.workspace,
  };
}

type ScriptUpdateProps = {
  workspaceId: string;
  scriptData: Script;
  saveAsCopy: boolean;
  campaignData: Campaign;
  created_by: string;
  created_at: string;
  tdb?: TenantDb;
  /** @deprecated ignored */
  client?: never;
};

export async function updateOrCopyScript({
  workspaceId,
  scriptData,
  saveAsCopy,
  campaignData,
  created_by,
  created_at,
  tdb: tdbIn,
}: ScriptUpdateProps) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  const { id, ...updateData } = scriptData;

  let originalScript: Script | null = null;
  if (id) {
    originalScript = (await tdb.script.findFirst({
      where: eq(scriptTable.id, id),
    })) as Script | null;
  }

  const upsertData: Partial<Script> = {
    ...scriptData,
    name:
      saveAsCopy && originalScript?.name === updateData.name
        ? `${updateData.name} (Copy)`
        : updateData.name,
    ...(saveAsCopy || !id
      ? { updated_by: created_by, updated_at: created_at }
      : { created_by, created_at }),
  };

  try {
    if (saveAsCopy || !id) {
      const { id: _unusedId, ...insertData } = upsertData;
      const [inserted] = await tdb.script.insert(insertData);
      return inserted;
    }

    const [updated] = await tdb.script.update({
      set: upsertData,
      where: eq(scriptTable.id, id!),
    });
    return updated;
  } catch (error: unknown) {
    const pgError = error as { code?: string; message?: string };
    if (pgError.code === "23505") {
      logger.error("Duplicate script conflict", error);
      throw new Error(
        `A script with this name (${upsertData.name}) already exists in the workspace`,
      );
    }
    throw error;
  }
}

export async function updateCampaignScript({
  workspaceId,
  campaignId,
  scriptId,
  tdb: tdbIn,
}: {
  workspaceId: string;
  campaignId: string;
  scriptId: number;
  /** @deprecated ignored — script lives on unified campaign row */
  campaignType?: string;
  tdb?: TenantDb;
  /** @deprecated ignored */
  client?: never;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  await tdb.campaign.update({
    set: { script_id: scriptId },
    where: eq(campaignTable.id, Number(campaignId)),
  });
}

export {
  fetchBasicResults,
  fetchCampaignCounts,
  fetchCampaignData,
  fetchCampaignDetails,
  fetchQueueCounts,
  fetchCampaignAudience,
  fetchAdvancedCampaignDetails,
} from "./campaign-stats.server";

export async function fetchCampaignsByType({
  workspaceId,
  type,
  tdb: tdbIn,
}: {
  workspaceId: string;
  type: LegacyCampaignTableKey;
  tdb?: TenantDb;
  /** @deprecated ignored */
  null?: never;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  const campaignTypes = campaignTypesForLegacyTableKey(type);

  try {
    const data = await tdb.campaign.findMany({
      where: inArray(campaignTable.type, campaignTypes),
      columns: { id: true, title: true },
    });
    return data?.map((row) => ({
      campaign_id: row.id,
      campaign: { id: row.id, title: row.title },
    }));
  } catch (error) {
    logger.error("Error fetching campaigns by type", error);
    return null;
  }
}

export async function getCampaignQueueById({campaign_id,
  onlyQueued = false,
}: {
  campaign_id: string;
  onlyQueued?: boolean;
}) {
  return fetchCampaignQueueWithContacts({
    campaignId: Number(campaign_id),
    onlyQueued,
  });
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
  ] as const;
  const dayKey = daysOfWeek[currentDay];
  if (!dayKey) {
    return false;
  }
  const todaySchedule = scheduleObject[dayKey];
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
