import { desc, eq } from "drizzle-orm";
import {
  audience as audienceTable,
  audience_upload as audienceUploadTable,
} from "@/db/schema";
import type { Json } from "@/lib/database.types";
import { createTenantDb } from "@/server/tenant-db";
import { db } from "@/server/db";

type AudienceRow = typeof audienceTable.$inferSelect;
type AudienceUploadRow = typeof audienceUploadTable.$inferSelect;

export async function findAudienceInWorkspace(
  workspaceId: string,
  audienceId: number,
): Promise<Pick<AudienceRow, "id"> | null> {
  const tdb = createTenantDb(workspaceId);
  return tdb.audience.findFirst({
    where: eq(audienceTable.id, audienceId),
    columns: { id: true },
  });
}

export async function markAudienceUpdating(
  workspaceId: string,
  audienceId: number,
): Promise<void> {
  const tdb = createTenantDb(workspaceId);
  await tdb.audience.update({
    set: { status: "updating" },
    where: eq(audienceTable.id, audienceId),
  });
}

export async function createAudienceForUpload(
  workspaceId: string,
  name: string,
): Promise<AudienceRow | null> {
  const tdb = createTenantDb(workspaceId);
  const [row] = await tdb.audience.insert({
    name,
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

export async function findAudienceUploadById(
  workspaceId: string,
  uploadId: number,
): Promise<AudienceUploadRow | null> {
  const tdb = createTenantDb(workspaceId);
  return tdb.audience_upload.findFirst({
    where: eq(audienceUploadTable.id, uploadId),
  });
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
    status: "empty",
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
