import { and, eq } from "drizzle-orm";
import { call, workspace } from "@/db/schema";
import { call_transcript } from "@/db/schema-transcription";
import { batchTranscriptionKey } from "@/lib/billing-keys";
import { hasFeatureFlag } from "@/lib/feature-flags";
import { warnInvalidWorkspaceFeatureFlags } from "@/lib/workspace-feature-flags.server";
import { isObject } from "@/lib/type-safety-utils";
import { debitAmountFromCredits } from "@/lib/pricing";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { emitTransactionHistoryInsertEvent } from "@/lib/workspace-events.server";
import { logger } from "@/lib/logger.server";
import { TRANSCRIPTION_BATCH_CREDITS } from "../../shared/billing-rates";
import { db } from "./db";
import { createTenantDb } from "./tenant-db";
import { readLockedVoiceCallRecordingManifest, type VoiceCallRecordingManifest } from "./voice-recording-batch.server";

const SOURCE_FIELDS = ["audio_url", "recording_sid", "recording_duration", "account_sid", "parent_call_sid", "direction", "to", "from"] as const;
type RecordingSource = Pick<typeof call.$inferSelect, "sid" | typeof SOURCE_FIELDS[number]>;
type TranscriptContent = Omit<typeof call_transcript.$inferInsert, "id" | "call_sid" | "created_at">;

function sameCapture(expected: VoiceCallRecordingManifest, current: VoiceCallRecordingManifest) {
  if (expected.state === "legacy") return current.state === "legacy";
  return expected.state === "single-part" && current.state === "single-part" &&
    expected.operationId === current.operationId && expected.recordingSid === current.recordingSid &&
    expected.audioUrl === current.audioUrl && expected.customer.customerSid === current.customer.customerSid &&
    expected.customer.durationSeconds === current.customer.durationSeconds;
}

function skipped(reason: "no_audio_url" | "already_transcribed" | "recording_parts_pending") {
  return { publication: { status: "skipped" as const, reason }, billingResult: null };
}

/** Provider I/O is complete; the same ownership fence protects media, transcript and charge. */
export async function publishVoiceRecordingTranscript(args: {
  workspaceId: string; source: RecordingSource; manifest: VoiceCallRecordingManifest; transcript: TranscriptContent;
}) {
  const key = batchTranscriptionKey(args.source.sid), amount = debitAmountFromCredits(TRANSCRIPTION_BATCH_CREDITS);
  const result = await db.transaction(async tx => {
    if (!args.source.audio_url) return skipped("no_audio_url");
    const manifest = await readLockedVoiceCallRecordingManifest(tx, args.workspaceId, args.source.sid, args.source.audio_url);
    const [current] = await tx.select().from(call).where(and(
      eq(call.workspace, args.workspaceId), eq(call.sid, args.source.sid),
    )).for("update");
    if (!current) return skipped("no_audio_url");
    if (current.transcript_id) return skipped("already_transcribed");
    if (!sameCapture(args.manifest, manifest) || SOURCE_FIELDS.some(field => current[field] !== args.source[field]))
      return skipped("recording_parts_pending");
    const [flags] = await tx.select({ value: workspace.feature_flags }).from(workspace).where(eq(workspace.id, args.workspaceId));
    if (flags) warnInvalidWorkspaceFeatureFlags(args.workspaceId, flags.value);
    const flagValue = flags?.value;
    const billed = hasFeatureFlag(isObject(flagValue) ? flagValue : null, "batchTranscription");
    const [transcript] = await tx.insert(call_transcript).values({ ...args.transcript, call_sid: current.sid }).returning();
    if (!transcript) throw new Error("Failed to insert call_transcript");
    const [linked] = await createTenantDb(args.workspaceId, tx).call.update({
      set: { transcript_id: transcript.id }, where: eq(call.sid, current.sid),
    });
    if (!linked) throw new Error("Failed to link recording transcript");
    const billingResult = billed ? await insertTransactionHistoryIdempotent(tx, {
      workspaceId: args.workspaceId, type: "DEBIT", amount, note: `Batch transcription ${current.sid}`,
      idempotencyKey: key, callSid: current.sid, emitEvent: false,
    }) : null;
    return { publication: { status: "completed" as const, transcriptId: transcript.id, billed }, billingResult };
  });
  if (result.billingResult?.inserted && result.billingResult.existingId) {
    try {
      await emitTransactionHistoryInsertEvent(args.workspaceId, { id: result.billingResult.existingId,
        workspace: args.workspaceId, type: "DEBIT", amount, idempotency_key: key });
    } catch (error) {
      logger.error("Recording transcript ledger event failed", error);
    }
  }
  return result.publication;
}
