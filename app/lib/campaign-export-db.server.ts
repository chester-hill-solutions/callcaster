import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  call as callTable,
  campaign as campaignTable,
  contact as contactTable,
  message as messageTable,
  outreach_attempt as outreachAttemptTable,
} from "@/db/schema";
import { fetchCampaignWithScriptForWorkspace } from "@/lib/campaign-ivr.server";
import { createTenantDb } from "@/server/tenant-db";

export async function findCampaignForMessageExport(
  workspaceId: string,
  campaignId: number,
) {
  const tdb = createTenantDb(workspaceId);
  return tdb.campaign.findFirst({
    where: eq(campaignTable.id, campaignId),
    columns: {
      id: true,
      title: true,
      start_date: true,
      end_date: true,
    },
  });
}

export async function findCampaignWithScriptForExport(
  workspaceId: string,
  campaignId: number,
) {
  return fetchCampaignWithScriptForWorkspace(workspaceId, campaignId);
}

export async function findExportContactsByIds(
  workspaceId: string,
  contactIds: number[],
) {
  if (contactIds.length === 0) {
    return [];
  }
  const tdb = createTenantDb(workspaceId);
  return tdb.contact.findMany({
    where: inArray(contactTable.id, contactIds),
  });
}

/**
 * The lower bound, or no bound at all.
 *
 * The caller passes `campaign.start_date ?? ""`, so an empty string is a live
 * input. While the column was `text()`, `gte(col, "")` compared
 * lexicographically and was therefore true of every non-empty value — the
 * bound silently did nothing. `new Date("")` is an Invalid Date, so wrapping
 * it would turn that no-op into a query that throws or matches nothing.
 * Omitting the clause preserves what the export actually did: no lower bound.
 */
function messageDateLowerBound(startDate: string) {
  const parsed = new Date(startDate);
  if (!startDate.trim() || Number.isNaN(parsed.getTime())) return undefined;
  return gte(messageTable.date_created, parsed);
}

export async function countExportCampaignMessages(
  workspaceId: string,
  campaignId: number,
  startDate: string,
  endDate: string,
) {
  const tdb = createTenantDb(workspaceId);
  return tdb.message.count({
    where: and(
      eq(messageTable.campaign_id, campaignId),
      messageDateLowerBound(startDate),
      lte(messageTable.date_created, new Date(endDate)),
    ),
  });
}

export async function listExportCampaignMessages(
  workspaceId: string,
  campaignId: number,
  startDate: string,
  endDate: string,
  offset: number,
  limit: number,
) {
  const tdb = createTenantDb(workspaceId);
  return tdb.message.findMany({
    where: and(
      eq(messageTable.campaign_id, campaignId),
      messageDateLowerBound(startDate),
      lte(messageTable.date_created, new Date(endDate)),
    ),
    orderBy: asc(messageTable.date_created),
    offset,
    limit,
  });
}

export async function countExportOutreachAttempts(
  workspaceId: string,
  campaignId: number,
) {
  const tdb = createTenantDb(workspaceId);
  return tdb.outreach_attempt.count({
    where: eq(outreachAttemptTable.campaign_id, campaignId),
  });
}

export async function listExportOutreachAttempts(
  workspaceId: string,
  campaignId: number,
  offset: number,
  limit: number,
) {
  const tdb = createTenantDb(workspaceId);
  return tdb.outreach_attempt.findMany({
    where: eq(outreachAttemptTable.campaign_id, campaignId),
    orderBy: asc(outreachAttemptTable.created_at),
    offset,
    limit,
  });
}

export async function findExportCallsByOutreachAttemptIds(
  workspaceId: string,
  outreachAttemptIds: number[],
) {
  if (outreachAttemptIds.length === 0) {
    return [];
  }
  const tdb = createTenantDb(workspaceId);
  return tdb.call.findMany({
    where: inArray(callTable.outreach_attempt_id, outreachAttemptIds),
  });
}
