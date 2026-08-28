import { eq } from "drizzle-orm";
import { call as callTable, workspace as workspaceTable } from "@/db/schema";
import { call_transcript } from "@/db/schema-transcription";
import { batchTranscriptionKey } from "@/lib/billing-keys";
import { hasFeatureFlag } from "@/lib/feature-flags";
import { downloadObject } from "@/lib/object-storage.server";
import { debitAmountFromCredits } from "@/lib/pricing";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { logger } from "@/lib/logger.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
import { adminDb } from "@/server/admin-db";
import { db } from "@/server/db";
import { TRANSCRIPTION_BATCH_CREDITS } from "../../../../shared/billing-rates";
import { requireStringParam } from "./shared.server";

const ELEVENLABS_SCRIBE_MODEL = "scribe_v2";

/**
 * Batch transcription is gated on the `batchTranscription` workspace flag,
 * which is default-off everywhere. Product policy for batch (ship or not, bill
 * per call or bundle it) is UNDECIDED — until it is, nothing is enqueued and
 * nothing is billed. Both the enqueue site (`runRecordingSideEffects`) and the
 * debit site below consult this so a stale queued job cannot bill either.
 */
export async function isBatchTranscriptionEnabled(
  workspaceId: string,
): Promise<boolean> {
  const row = await adminDb.query.workspace.findFirst({
    where: eq(workspaceTable.id, workspaceId),
    columns: { feature_flags: true },
  });
  return hasFeatureFlag(
    row?.feature_flags as Record<string, unknown> | undefined,
    "batchTranscription",
  );
}

type ElevenLabsBatchWord = {
  text: string;
  start?: number | null;
  end?: number | null;
  type?: string;
  speaker_id?: string | null;
  logprob?: number;
};

type ElevenLabsBatchResponse = {
  text?: string;
  language_code?: string;
  words?: ElevenLabsBatchWord[];
};

async function transcribeWithElevenLabs(audio: Buffer): Promise<ElevenLabsBatchResponse> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const formData = new FormData();
  formData.append("model_id", ELEVENLABS_SCRIBE_MODEL);
  formData.append("diarize", "true");
  formData.append("detect_speaker_roles", "true");
  formData.append(
    "file",
    new Blob([Uint8Array.from(audio)], { type: "audio/mpeg" }),
    "recording.mp3",
  );

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs transcribe failed (${response.status}): ${detail}`);
  }

  const body = (await response.json()) as ElevenLabsBatchResponse;
  if (!body.text?.trim()) {
    throw new Error("ElevenLabs transcribe returned empty text");
  }
  return body;
}

export async function elevenlabsBatchTranscribeHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const callSid = requireStringParam(params, "callSid");
  if (!callSid) {
    throw new Error("elevenlabs_batch_transcribe: missing callSid");
  }

  const callRow = await adminDb.query.call.findFirst({
    where: eq(callTable.sid, callSid),
  });
  if (!callRow?.audio_url || !callRow.workspace) {
    return { status: "skipped", reason: "no_audio_url" };
  }
  if (callRow.transcript_id) {
    return { status: "skipped", reason: "already_transcribed" };
  }

  const audio = await downloadObject("workspaceAudio", callRow.audio_url);
  const result = await transcribeWithElevenLabs(audio);
  if (!result.text) {
    throw new Error("elevenlabs_batch_transcribe: transcription returned no text");
  }
  const text = result.text.trim();

  const [transcript] = await adminDb
    .insert(call_transcript)
    .values({
      call_sid: callSid,
      provider: "elevenlabs_scribe_v2",
      language: result.language_code ?? "en",
      full_text: text,
      word_count: text.split(/\s+/).filter(Boolean).length,
      duration_ms: callRow.recording_duration
        ? Number.parseInt(callRow.recording_duration, 10) * 1000
        : null,
      metadata: {
        elevenlabsModel: ELEVENLABS_SCRIBE_MODEL,
        wordCount: result.words?.length ?? 0,
      },
    })
    .returning();

  if (!transcript) {
    throw new Error("Failed to insert call_transcript");
  }

  await adminDb
    .update(callTable)
    .set({ transcript_id: transcript.id })
    .where(eq(callTable.sid, callSid));

  const billable = await isBatchTranscriptionEnabled(callRow.workspace);
  if (billable) {
    await insertTransactionHistoryIdempotent(db, {
      workspaceId: callRow.workspace,
      type: "DEBIT",
      amount: debitAmountFromCredits(TRANSCRIPTION_BATCH_CREDITS),
      note: `Batch transcription ${callSid}`,
      idempotencyKey: batchTranscriptionKey(callSid),
      callSid,
    });
  }

  logger.info("elevenlabs_batch_transcribe.completed", {
    callSid,
    workspaceId: callRow.workspace,
    transcriptId: transcript.id,
    billed: billable,
  });

  return { status: "completed", transcriptId: transcript.id };
}
