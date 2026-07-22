import { and, desc, eq } from "drizzle-orm";
import {
  audience as audienceTable,
  audience_upload as audienceUploadTable,
  campaign as campaignTable,
  campaign_audience as campaignAudienceTable,
  contact as contactTable,
  contact_audience as contactAudienceTable,
} from "@/db/schema";
import type { Json } from "@/lib/db-types";
import { parsePhoneNumber } from "@/lib/phone";
import { createTenantDb } from "@/server/tenant-db";
import { db } from "@/server/db";

type AudienceRow = typeof audienceTable.$inferSelect;
type AudienceUploadRow = typeof audienceUploadTable.$inferSelect;

export async function findAudienceInWorkspace(
  workspaceId: string,
  audienceId: number,
): Promise<Pick<AudienceRow, "id"> | null> {
  const tdb = createTenantDb(workspaceId);
  return (await tdb.audience.findFirst({
    where: eq(audienceTable.id, audienceId),
    columns: { id: true },
  })) ?? null;
}

export async function markAudienceUpdating(
  workspaceId: string,
  audienceId: number,
): Promise<void> {
  const tdb = createTenantDb(workspaceId);
  await tdb.audience.update({
    // audience_status enum is pending|processing|completed|error (no "updating"
    // value exists — see drizzle/0000_baseline.sql:86). An existing audience
    // receiving a new upload is mid-operation, which maps to "processing".
    set: { status: "processing" },
    where: eq(audienceTable.id, audienceId),
  });
}

export async function createAudienceForUpload(
  workspaceId: string,
  name: string,
): Promise<AudienceRow | null> {
  const tdb = createTenantDb(workspaceId);
  const trimmed = name.trim();
  const [row] = await tdb.audience.insert({
    name: trimmed.length > 0 ? trimmed : null,
    created_at: new Date().toISOString(),
    is_conditional: false,
    status: "pending",
    total_contacts: 0,
  });
  return row ?? null;
}

export async function createAudienceUploadRecord(args: {
  workspaceId: string;
  audienceId: number;
  createdBy: string;
  fileName: string;
  fileSize: number;
  headerMapping: Record<string, unknown>;
  splitNameColumn: string | null;
}): Promise<AudienceUploadRow | null> {
  const tdb = createTenantDb(args.workspaceId);
  const [row] = await tdb.audience_upload.insert({
    audience_id: args.audienceId,
    created_by: args.createdBy,
    created_at: new Date().toISOString(),
    status: "pending",
    file_name: args.fileName,
    file_size: args.fileSize,
    total_contacts: 0,
    processed_contacts: 0,
    header_mapping: args.headerMapping as Json,
    split_name_column: args.splitNameColumn,
  });
  return row ?? null;
}

/**
 * Normalized (E.164) phone numbers of every contact already linked to the
 * audience. Used by the upload processor to skip rows that would duplicate an
 * existing audience member. Contacts without a parseable phone are skipped.
 */
export async function listAudiencePhones(
  workspaceId: string,
  audienceId: number,
): Promise<Set<string>> {
  const rows = await db
    .select({ phone: contactTable.phone })
    .from(contactAudienceTable)
    .innerJoin(
      contactTable,
      eq(contactAudienceTable.contact_id, contactTable.id),
    )
    .where(
      and(
        eq(contactAudienceTable.audience_id, audienceId),
        eq(contactTable.workspace, workspaceId),
      ),
    );

  const phones = new Set<string>();
  for (const row of rows) {
    const normalized = parsePhoneNumber(row.phone ?? null);
    if (normalized) phones.add(normalized);
  }
  return phones;
}

export async function findCampaignForAudienceUpload(
  workspaceId: string,
  campaignId: number,
): Promise<boolean> {
  const tdb = createTenantDb(workspaceId);
  const campaign = await tdb.campaign.findFirst({
    where: eq(campaignTable.id, campaignId),
    columns: { id: true },
  });
  return campaign != null;
}

export async function linkAudienceToCampaign(args: {
  workspaceId: string;
  campaignId: number;
  audienceId: number;
}): Promise<boolean> {
  if (!(await findCampaignForAudienceUpload(args.workspaceId, args.campaignId))) {
    return false;
  }

  await db.insert(campaignAudienceTable).values({
    campaign_id: args.campaignId,
    audience_id: args.audienceId,
    created_at: new Date().toISOString(),
  });
  return true;
}

export async function findAudienceUploadById(
  workspaceId: string,
  uploadId: number,
): Promise<AudienceUploadRow | null> {
  const tdb = createTenantDb(workspaceId);
  return (await tdb.audience_upload.findFirst({
    where: eq(audienceUploadTable.id, uploadId),
  })) ?? null;
}

export async function findAudienceWorkspaceById(
  audienceId: number,
): Promise<string | null> {
  const rows = await db
    .select({ workspace: audienceTable.workspace })
    .from(audienceTable)
    .where(eq(audienceTable.id, audienceId))
    .limit(1);
  return rows[0]?.workspace ?? null;
}

export async function upsertAudienceById(
  audienceId: number,
  values: Partial<AudienceRow>,
): Promise<AudienceRow | null> {
  const workspaceId = await findAudienceWorkspaceById(audienceId);
  if (!workspaceId) {
    return null;
  }
  const tdb = createTenantDb(workspaceId);
  const [row] = await tdb.audience.update({
    set: values,
    where: eq(audienceTable.id, audienceId),
  });
  return row ?? null;
}

export async function deleteAudienceById(audienceId: number): Promise<boolean> {
  const workspaceId = await findAudienceWorkspaceById(audienceId);
  if (!workspaceId) {
    return false;
  }
  const tdb = createTenantDb(workspaceId);
  await tdb.audience.delete({
    where: eq(audienceTable.id, audienceId),
  });
  return true;
}

export async function createEmptyAudience(
  workspaceId: string,
  name: string,
): Promise<AudienceRow | null> {
  const tdb = createTenantDb(workspaceId);
  const [row] = await tdb.audience.insert({
    name,
    // audience_status enum is pending|processing|completed|error — there is no
    // "empty" value (see drizzle/0000_baseline.sql:86). A manually-created
    // audience has no upload pending and is immediately usable, so it's
    // represented as "completed" (consistent with the post-import finalize
    // state in audience-upload-process.server.ts).
    status: "completed",
  });
  return row ?? null;
}

export async function listAudienceUploadsByAudienceId(
  workspaceId: string,
  audienceId: number,
): Promise<AudienceUploadRow[]> {
  const tdb = createTenantDb(workspaceId);
  return tdb.audience_upload.findMany({
    where: eq(audienceUploadTable.audience_id, audienceId),
    orderBy: [desc(audienceUploadTable.created_at)],
  });
}
