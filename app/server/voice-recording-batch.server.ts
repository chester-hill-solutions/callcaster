import { and, eq } from "drizzle-orm";
import { workspace, workspace_voice_recording_operation as recordings, workspace_voice_reservation as reservations } from "@/db/schema";
import { createTenantDb } from "./tenant-db";
import { db } from "./db";
import { voiceCustomerMediaBoundary } from "./voice-customer-media-boundary.server";

/** Snapshot the customer and capture set through the existing ownership fence. */
export async function readVoiceCallRecordingManifest(workspaceId: string, callSid: string, audioUrl: string) {
  return db.transaction(async (tx) => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId)).for("no key update");
    const tdb = createTenantDb(workspaceId, tx);
    const where = eq(recordings.logical_call_sid, callSid);
    const first = await tdb.workspace_voice_recording_operation.findFirst({ where });
    // Preserve the existing pre-journal recording policy.
    if (!first) return { state: "legacy" as const };
    const [owner] = await tx.select().from(reservations).where(and(
      eq(reservations.workspace, workspaceId), eq(reservations.id, first.reservation_id),
    )).for("update");
    if (!owner) return { state: "pending" as const, reason: "customer_owner_unavailable" };
    // Initial nonce preparation uses this reservation lock; other captures use the workspace fence.
    const rows = await tdb.workspace_voice_recording_operation.findMany({ where, limit: 2 });
    if (rows.length !== 1) return { state: "pending" as const, reason: "recording_assembly_required" };
    const row = rows[0];
    const logicalSid = owner.setup_sid && !owner.conference_id ? owner.setup_sid : owner.provider_sid;
    if (!row || row.reservation_id !== owner.id || row.account_sid !== owner.account_sid || row.user_id !== owner.user_id ||
        logicalSid !== callSid || row.source_call_sid !== callSid || row.source_parent_sid !== null)
      return { state: "pending" as const, reason: "recording_owner_mismatch" };
    if ((row.kind !== "dial" && row.kind !== "customer") || row.state !== "accepted" ||
        row.provider_status !== "completed" || row.terminal_at === null || row.audio_url !== audioUrl)
      return { state: "pending" as const, reason: "recording_incomplete" };
    const boundary = voiceCustomerMediaBoundary(owner);
    return boundary ? { state: "single-part" as const, operationId: row.id, recordingSid: row.provider_sid,
      audioUrl: row.audio_url, customer: boundary } : { state: "pending" as const, reason: "customer_boundary_unproven" };
  });
}

/** The current worker consumes one whole file; multipart and room history still need assembly. */
export async function isSinglePartCallRecording(workspaceId: string, callSid: string, audioUrl: string) {
  const manifest = await readVoiceCallRecordingManifest(workspaceId, callSid, audioUrl);
  return manifest.state === "legacy" || manifest.state === "single-part";
}
