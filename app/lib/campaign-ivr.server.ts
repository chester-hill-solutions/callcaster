import type { SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/database.types";
import type { Script } from "@/lib/types";
import {
  campaign as campaignTable,
  campaign_audience as campaignAudienceTable,
  script as scriptTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";

/** PostgREST select for unified campaign + joined script row. */
export const CAMPAIGN_WITH_SCRIPT_SELECT = "*, script:script(*)";

export const CALL_WITH_CAMPAIGN_SCRIPT_SELECT =
  "*, campaign(*, script:script(*))";

export type CampaignWithScript = {
  script?: Script | Script[] | null;
  workspace?: string | null;
  voicemail_file?: string | null;
};

export function resolveCampaignScript<T extends { steps?: unknown }>(
  campaign: { script?: T | T[] | null } | null | undefined,
): T | null {
  if (!campaign?.script) return null;
  return Array.isArray(campaign.script) ? (campaign.script[0] ?? null) : campaign.script;
}

export function ivrScriptStepsFromCampaign(
  campaign: { script?: { steps?: unknown } | { steps?: unknown }[] | null } | null | undefined,
): unknown {
  return resolveCampaignScript(campaign)?.steps ?? null;
}

export async function fetchCampaignWithScript(
  supabase: SupabaseClient<Database>,
  campaignId: string | number,
) {
  const { data, error } = await supabase
    .from("campaign")
    .select(CAMPAIGN_WITH_SCRIPT_SELECT)
    .eq("id", Number(campaignId))
    .single();
  if (error) throw error;
  return data;
}

export async function fetchCampaignByIdForWorkspace(
  workspaceId: string,
  campaignId: string | number,
) {
  const tdb = createTenantDb(workspaceId);
  const row = await tdb.campaign.findFirst({
    where: eq(campaignTable.id, Number(campaignId)),
  });
  if (!row) {
    throw new Error(`Campaign ${campaignId} not found`);
  }
  return row;
}

export async function fetchCampaignWithScriptForWorkspace(
  workspaceId: string,
  campaignId: string | number,
) {
  const tdb = createTenantDb(workspaceId);
  const campaign = await tdb.campaign.findFirst({
    where: eq(campaignTable.id, Number(campaignId)),
  });
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }
  const script = campaign.script_id
    ? await tdb.script.findFirst({
        where: eq(scriptTable.id, campaign.script_id),
      })
    : null;
  return { ...campaign, script };
}

export async function findCampaignInWorkspace(
  workspaceId: string,
  campaignId: string | number,
) {
  const tdb = createTenantDb(workspaceId);
  return tdb.campaign.findFirst({
    where: eq(campaignTable.id, Number(campaignId)),
  });
}

export async function findCampaignExportMeta(
  workspaceId: string,
  campaignId: number,
) {
  const tdb = createTenantDb(workspaceId);
  return tdb.campaign.findFirst({
    where: eq(campaignTable.id, campaignId),
    columns: { id: true, type: true, title: true, workspace: true },
  });
}

export async function findCampaignMessageMedia(
  workspaceId: string,
  campaignId: number,
) {
  const tdb = createTenantDb(workspaceId);
  return tdb.campaign.findFirst({
    where: eq(campaignTable.id, campaignId),
    columns: { id: true, message_media: true },
  });
}

export async function updateCampaignMessageMedia(
  workspaceId: string,
  campaignId: number,
  messageMedia: string[],
) {
  const tdb = createTenantDb(workspaceId);
  const [row] = await tdb.campaign.update({
    set: { message_media: messageMedia },
    where: eq(campaignTable.id, campaignId),
  });
  return row ?? null;
}

export async function updateCampaignStatusInWorkspace(
  workspaceId: string,
  campaignId: number,
  update: { status: string; is_active?: boolean },
) {
  const tdb = createTenantDb(workspaceId);
  const [row] = await tdb.campaign.update({
    set: update,
    where: eq(campaignTable.id, campaignId),
  });
  if (!row) {
    throw new Error("Campaign not found");
  }
  return row;
}

export async function insertCampaignForWorkspace(
  workspaceId: string,
  values: Record<string, unknown>,
) {
  const tdb = createTenantDb(workspaceId);
  const [row] = await tdb.campaign.insert(values);
  if (!row) {
    throw new Error("Failed to create campaign");
  }
  return row;
}

export async function fetchCampaignForScriptEdit(
  workspaceId: string,
  campaignId: number,
) {
  const tdb = createTenantDb(workspaceId);
  const campaign = await tdb.campaign.findFirst({
    where: eq(campaignTable.id, campaignId),
  });
  if (!campaign) {
    return null;
  }
  const script = campaign.script_id
    ? await tdb.script.findFirst({
        where: eq(scriptTable.id, campaign.script_id),
      })
    : null;
  const campaignAudience = await db
    .select()
    .from(campaignAudienceTable)
    .where(eq(campaignAudienceTable.campaign_id, campaignId));
  return { ...campaign, script, campaign_audience: campaignAudience };
}

export async function listArchivedCampaignsInWorkspace(workspaceId: string) {
  const tdb = createTenantDb(workspaceId);
  return tdb.campaign.findMany({
    where: eq(campaignTable.status, "archived"),
    orderBy: (campaign, { desc: descFn }) => [descFn(campaign.created_at)],
  });
}
