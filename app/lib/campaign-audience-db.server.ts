import { and, eq, inArray } from "drizzle-orm";
import {
  audience as audienceTable,
  campaign as campaignTable,
  campaign_audience as campaignAudienceTable,
  contact_audience as contactAudienceTable,
} from "@/db/schema";
import { db } from "@/server/db";

export async function findCampaignAudienceLink(campaignId: number, audienceId: number) {
  const [row] = await db
    .select()
    .from(campaignAudienceTable)
    .where(
      and(
        eq(campaignAudienceTable.campaign_id, campaignId),
        eq(campaignAudienceTable.audience_id, audienceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertCampaignAudienceLink(campaignId: number, audienceId: number) {
  await db
    .insert(campaignAudienceTable)
    .values({ campaign_id: campaignId, audience_id: audienceId, created_at: new Date().toISOString() });
}

export async function deleteCampaignAudienceLink(campaignId: number, audienceId: number) {
  await db
    .delete(campaignAudienceTable)
    .where(
      and(
        eq(campaignAudienceTable.campaign_id, campaignId),
        eq(campaignAudienceTable.audience_id, audienceId),
      ),
    );
}

export async function listCampaignAudienceIds(campaignId: number) {
  const rows = await db
    .select({ audience_id: campaignAudienceTable.audience_id })
    .from(campaignAudienceTable)
    .where(eq(campaignAudienceTable.campaign_id, campaignId));
  return rows.map((row) => row.audience_id);
}

export async function listContactIdsForAudience(audienceId: number) {
  const rows = await db
    .select({ contact_id: contactAudienceTable.contact_id })
    .from(contactAudienceTable)
    .where(eq(contactAudienceTable.audience_id, audienceId));
  return rows.map((row) => row.contact_id);
}

export async function listContactIdsForAudiences(audienceIds: number[]) {
  if (audienceIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({ contact_id: contactAudienceTable.contact_id })
    .from(contactAudienceTable)
    .where(inArray(contactAudienceTable.audience_id, audienceIds));
  return rows.map((row) => row.contact_id);
}

export async function campaignAndAudienceShareWorkspace(
  campaignId: number,
  audienceId: number,
) {
  const [campaign] = await db
    .select({ workspace: campaignTable.workspace })
    .from(campaignTable)
    .where(eq(campaignTable.id, campaignId))
    .limit(1);

  if (!campaign?.workspace) {
    return false;
  }

  const [audience] = await db
    .select({ id: audienceTable.id })
    .from(audienceTable)
    .where(and(eq(audienceTable.id, audienceId), eq(audienceTable.workspace, campaign.workspace)))
    .limit(1);

  return Boolean(audience);
}

export async function findCampaignById(campaignId: number) {
  const [row] = await db
    .select({
      id: campaignTable.id,
      workspace: campaignTable.workspace,
      dial_type: campaignTable.dial_type,
      title: campaignTable.title,
      status: campaignTable.status,
      schedule: campaignTable.schedule,
    })
    .from(campaignTable)
    .where(eq(campaignTable.id, campaignId))
    .limit(1);
  return row ?? null;
}
