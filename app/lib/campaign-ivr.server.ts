import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Script } from "@/lib/types";
import { campaign as campaignTable, script as scriptTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { eq } from "drizzle-orm";

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
