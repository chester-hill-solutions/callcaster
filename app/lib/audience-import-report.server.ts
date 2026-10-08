import { and, asc, eq, gt } from "drizzle-orm";
import { audience_import_run, audience_import_row, audience_upload } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";

export async function getAudienceImportProgress(workspaceId: string, runId: string, audienceId: number) {
  return createTenantDb(workspaceId).audience_import_run.findFirst({
    where: and(eq(audience_import_run.id, runId), eq(audience_import_run.audience_id, audienceId)),
    columns: { id: true, source_rows: true, next_index: true, mapping: true, imported: true, invalid: true, duplicates: true, state: true },
  });
}
export async function getAudienceImportReport(workspaceId: string, uploadId: number, afterRecord = 0, limit = 100) {
  if (!Number.isSafeInteger(afterRecord) || afterRecord < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid import report page");
  const tdb = createTenantDb(workspaceId);
  const upload = await tdb.audience_upload.findFirst({ where: eq(audience_upload.id, uploadId), columns: { import_run_id: true, audience_id: true, status: true } });
  if (!upload?.import_run_id) return null;
  const run = await getAudienceImportProgress(workspaceId, upload.import_run_id, upload.audience_id);
  if (!run) return null;
  const rows = await tdb.audience_import_row.findMany({
    where: and(eq(audience_import_row.run_id, run.id), gt(audience_import_row.record_number, afterRecord)),
    orderBy: asc(audience_import_row.record_number), limit,
    columns: { record_number: true, source: true, outcome: true, reason: true, contact_id: true, household_id: true, warnings: true },
  });
  return { run, rows, uploadStatus: upload.status };
}
