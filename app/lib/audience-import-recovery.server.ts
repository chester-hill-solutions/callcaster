import { and, count, eq, sql } from "drizzle-orm";
import { audience, audience_upload, audience_import_run, audience_import_row, contact_audience } from "@/db/schema";
import { db, type Database } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { commitAudienceImportRows } from "@/lib/audience-import-effects.server";
import type { PreparedAudienceImport } from "@/lib/audience-import-map";
import { AUDIENCE_UPLOAD_CHUNK_SIZE } from "../../shared/audience-upload";

export type AudienceImportClaim = { jobId: number; attemptCount: number; claimedBy: string };
export type AudienceImportContext = { workspaceId: string; audienceId: number; uploadId: number; userId: string; claim: AudienceImportClaim };
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type AudienceImportRun = typeof audience_import_run.$inferSelect;

export class AudienceImportClaimLost extends Error {
  constructor() { super("Audience import worker claim lost"); }
}
async function lockClaim(tx: Transaction, ctx: AudienceImportContext) {
  const rows = await tx.execute(sql`select id from job where id = ${ctx.claim.jobId}
    and type = 'audience_upload' and workspace_id = ${ctx.workspaceId}::uuid
    and coalesce(user_id::text, params->>'userId') = ${ctx.userId}
    and status = 'running' and attempt_count = ${ctx.claim.attemptCount}
    and claimed_by = ${ctx.claim.claimedBy}
    and claimed_until > clock_timestamp()
    and params->>'uploadId' = ${String(ctx.uploadId)} and params->>'audienceId' = ${String(ctx.audienceId)}
    for update`);
  if (!rows.length) throw new AudienceImportClaimLost();
}
async function lockAudience(tx: Transaction, ctx: AudienceImportContext) {
  const rows = await tx.select({ id: audience.id }).from(audience)
    .where(and(eq(audience.id, ctx.audienceId), eq(audience.workspace, ctx.workspaceId))).for("update");
  if (!rows.length) throw new Error("Audience not found");
  const tdb = createTenantDb(ctx.workspaceId, tx);
  const upload = await tdb.audience_upload.findFirst({ where: and(eq(audience_upload.id, ctx.uploadId), eq(audience_upload.audience_id, ctx.audienceId)) });
  if (!upload) throw new Error("Audience upload not found");
  return { tdb, upload };
}
async function fenced<T>(ctx: AudienceImportContext, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await lockClaim(tx, ctx);
    const result = await fn(tx);
    // clock_timestamp(), not transaction now(): expiry during a batch must roll
    // back every effect even though a stale-claim sweep waits on this row lock.
    await lockClaim(tx, ctx);
    return result;
  });
}
export async function startAudienceImport(ctx: AudienceImportContext, prepared: PreparedAudienceImport): Promise<AudienceImportRun> {
  return fenced(ctx, async tx => {
    const { tdb, upload } = await lockAudience(tx, ctx);
    if (!upload.import_run_id && (ctx.claim.attemptCount > 1 || upload.processed_contacts > 0)) {
      throw new Error("This upload has no recovery evidence. Review its previous rows before importing into a new audience.");
    }
    await tx.insert(audience_import_run).values({ workspace: ctx.workspaceId, audience_id: ctx.audienceId,
      identity: prepared.identity, file_sha256: prepared.fileSha256, mapping: prepared.effective,
      source_rows: prepared.contacts.length, created_by: ctx.userId })
      .onConflictDoNothing({ target: [audience_import_run.workspace, audience_import_run.audience_id, audience_import_run.identity] });
    const run = await tdb.audience_import_run.findFirst({ where: and(eq(audience_import_run.audience_id, ctx.audienceId), eq(audience_import_run.identity, prepared.identity)) });
    if (!run) throw new Error("Import run not found");
    if (upload.import_run_id && upload.import_run_id !== run.id) throw new Error("Upload content or mapping changed during recovery");
    await tdb.audience_upload.update({ set: { import_run_id: run.id, status: run.state, error_message: null,
      total_contacts: run.source_rows - run.duplicates, processed_contacts: run.next_index - run.duplicates }, where: eq(audience_upload.id, ctx.uploadId) });
    return run;
  });
}
export async function advanceAudienceImport(ctx: AudienceImportContext, runId: string, prepared: PreparedAudienceImport): Promise<AudienceImportRun> {
  return fenced(ctx, async tx => {
    const { tdb } = await lockAudience(tx, ctx);
    const run = await tdb.audience_import_run.findFirst({ where: and(eq(audience_import_run.id, runId), eq(audience_import_run.audience_id, ctx.audienceId)) });
    if (!run || run.identity !== prepared.identity) throw new Error("Import identity mismatch");
    if (run.state === "completed") return run;
    const rows = prepared.contacts.slice(run.next_index, run.next_index + AUDIENCE_UPLOAD_CHUNK_SIZE);
    const delta = await commitAudienceImportRows(tx, run, rows);
    const next = { next_index: run.next_index + rows.length, imported: run.imported + delta.imported,
      invalid: run.invalid + delta.invalid, duplicates: run.duplicates + delta.duplicates };
    const [updated] = await tdb.audience_import_run.update({ set: next, where: eq(audience_import_run.id, run.id) });
    await tdb.audience_upload.update({ set: { status: "processing", error_message: null,
      total_contacts: run.source_rows - next.duplicates, processed_contacts: next.next_index - next.duplicates }, where: eq(audience_upload.id, ctx.uploadId) });
    if (!updated) throw new Error("Import run disappeared");
    return updated;
  });
}
export async function finishAudienceImport(ctx: AudienceImportContext, runId: string): Promise<AudienceImportRun> {
  return fenced(ctx, async tx => {
    const { tdb } = await lockAudience(tx, ctx);
    const run = await tdb.audience_import_run.findFirst({ where: and(eq(audience_import_run.id, runId), eq(audience_import_run.audience_id, ctx.audienceId)) });
    if (!run || run.next_index !== run.source_rows) throw new Error("Import has unfinished source rows");
    const [receipts] = await tx.select({ value: count() }).from(audience_import_row).where(and(eq(audience_import_row.run_id, run.id), eq(audience_import_row.workspace, ctx.workspaceId)));
    if (Number(receipts?.value) !== run.source_rows) throw new Error("Import row evidence is incomplete");
    const [members] = await tx.select({ value: count() }).from(contact_audience).where(eq(contact_audience.audience_id, ctx.audienceId));
    await tdb.audience.update({ set: { status: "completed", error_message: null, total_contacts: Number(members?.value ?? 0) }, where: eq(audience.id, ctx.audienceId) });
    await tdb.audience_upload.update({ set: { status: "completed", error_message: null, processed_at: new Date().toISOString(),
      total_contacts: run.source_rows - run.duplicates, processed_contacts: run.next_index - run.duplicates }, where: eq(audience_upload.id, ctx.uploadId) });
    const [updated] = await tdb.audience_import_run.update({ set: { state: "completed" }, where: eq(audience_import_run.id, run.id) });
    if (!updated) throw new Error("Import run disappeared");
    return updated;
  });
}
export async function recordAudienceImportFailure(ctx: AudienceImportContext, message: string) {
  return fenced(ctx, async tx => {
    const { tdb, upload } = await lockAudience(tx, ctx);
    // Completed SQL is authoritative when a later sidecar write fails. A retry
    // repairs storage; it cannot turn a committed run back into an insertion.
    if (upload.status === "completed") return false;
    await tdb.audience_upload.update({ set: { status: "error", error_message: message }, where: eq(audience_upload.id, ctx.uploadId) });
    await tdb.audience.update({ set: { status: "error", error_message: message }, where: eq(audience.id, ctx.audienceId) });
    return true;
  });
}
