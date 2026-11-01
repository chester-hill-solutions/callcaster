import { and, eq, or } from "drizzle-orm";
import { workspace, workspace_voice_recording_operation as recordings, workspace_voice_reservation as reservations } from "@/db/schema";
import { createTenantDb } from "./tenant-db";
import { db } from "./db";
import { voiceCustomerMediaBoundary } from "./voice-customer-media-boundary.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";

/** Snapshot the customer and capture set through the existing ownership fence. */
export async function readVoiceCallRecordingManifest(workspaceId: string, callSid: string, audioUrl: string) {
  return db.transaction(tx => readLockedVoiceCallRecordingManifest(tx, workspaceId, callSid, audioUrl));
}

/** Publication keeps this fence until transcript, Call and ledger writes commit. */
export async function readLockedVoiceCallRecordingManifest(tx: CreditTransaction, workspaceId: string, callSid: string, audioUrl: string) {
  await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId)).for("no key update");
  const tdb = createTenantDb(workspaceId, tx);
  const where = eq(recordings.logical_call_sid, callSid);
  const first = await tdb.workspace_voice_recording_operation.findFirst({ where });
  // Initial nonce preparation takes only the reservation lock, including before its first part exists.
  const owners = await tx.select().from(reservations).where(and(eq(reservations.workspace, workspaceId),
    first ? eq(reservations.id, first.reservation_id) : or(eq(reservations.provider_sid, callSid), eq(reservations.setup_sid, callSid)),
  )).orderBy(reservations.id).limit(2).for("update");
  const owner = owners[0];
  if (!owner || owners.length !== 1) return first || owners.length
    ? { state: "pending" as const, reason: "customer_owner_unavailable" } : { state: "legacy" as const };
  const rows = await tdb.workspace_voice_recording_operation.findMany({ where, limit: 2 });
  if (!rows.length) return owner.customer_recording_id
    ? { state: "pending" as const, reason: "recording_incomplete" } : { state: "legacy" as const };
  if (rows.length !== 1) return { state: "pending" as const, reason: "recording_assembly_required" };
  return singlePartManifest(owner, rows[0], callSid, audioUrl);
}

function singlePartManifest(owner: typeof reservations.$inferSelect, row: typeof recordings.$inferSelect | undefined,
  callSid: string, audioUrl: string) {
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
}

export type VoiceCallRecordingManifest = Awaited<ReturnType<typeof readLockedVoiceCallRecordingManifest>>;

/** The current worker consumes one whole file; multipart and room history still need assembly. */
export async function isSinglePartCallRecording(workspaceId: string, callSid: string, audioUrl: string) {
  const manifest = await readVoiceCallRecordingManifest(workspaceId, callSid, audioUrl);
  return manifest.state === "legacy" || manifest.state === "single-part";
}
