import { eq } from "drizzle-orm";
import { workspace } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { NORMALIZED_AUDIO_CONTENT_TYPE } from "@/lib/audio-upload";
import { logger } from "@/lib/logger.server";
import { uploadObject } from "@/lib/object-storage.server";
import {
  readTwilioWorkspaceCredentials,
  type TwilioWorkspaceCredentials,
} from "@/lib/twilio-workspace-credentials";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 200;

function parseTwilioDataColumn(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

/** Railway Buckets object path for a Twilio call recording copy. */
export function callRecordingStoragePath(
  workspaceId: string,
  callSid: string,
): string {
  return `${workspaceId}/recording-${callSid}.mp3`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterDelay(baseMs: number, attempt: number): number {
  const exp = baseMs * 2 ** attempt;
  return exp + Math.floor(Math.random() * baseMs);
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function twilioRecordingMp3Url(accountSid: string, recordingSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
}

function basicAuthHeader(creds: TwilioWorkspaceCredentials): string {
  return `Basic ${Buffer.from(`${creds.sid}:${creds.authToken}`).toString("base64")}`;
}

type FetchTwilioRecordingDeps = {
  fetch?: typeof fetch;
  maxAttempts?: number;
  baseDelayMs?: number;
};

export async function fetchTwilioRecordingMp3(
  accountSid: string,
  recordingSid: string,
  creds: TwilioWorkspaceCredentials,
  deps: FetchTwilioRecordingDeps = {},
): Promise<Buffer> {
  const fetchFn = deps.fetch ?? fetch;
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = deps.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const url = twilioRecordingMp3Url(accountSid, recordingSid);
  const headers = { Authorization: basicAuthHeader(creds) };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetchFn(url, { headers });
      if (!response.ok) {
        const message = `Twilio recording fetch failed (${response.status} ${response.statusText})`;
        if (isRetryableHttpStatus(response.status) && attempt < maxAttempts - 1) {
          logger.warn("call_recording.fetch_retry", {
            accountSid,
            recordingSid,
            attempt: attempt + 1,
            maxAttempts,
            status: response.status,
          });
          await sleep(jitterDelay(baseDelayMs, attempt));
          continue;
        }
        throw new Error(message);
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) {
        throw new Error("Twilio recording fetch returned empty body");
      }
      return bytes;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable =
        error instanceof TypeError || lastError.message.includes("fetch failed");

      if (retryable && attempt < maxAttempts - 1) {
        logger.warn("call_recording.fetch_retry", {
          accountSid,
          recordingSid,
          attempt: attempt + 1,
          maxAttempts,
          error: lastError.message,
        });
        await sleep(jitterDelay(baseDelayMs, attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("Twilio recording fetch failed");
}

export async function loadWorkspaceTwilioCredentials(
  workspaceId: string,
): Promise<TwilioWorkspaceCredentials | null> {
  const row = await adminDb.query.workspace.findFirst({
    where: eq(workspace.id, workspaceId),
    columns: { twilio_data: true },
  });
  if (!row) return null;
  return readTwilioWorkspaceCredentials(parseTwilioDataColumn(row.twilio_data));
}

type PersistCallRecordingArgs = {
  workspaceId: string;
  callSid: string;
  accountSid: string;
  recordingSid: string;
  existingAudioUrl?: string | null;
};

type PersistCallRecordingDeps = FetchTwilioRecordingDeps & {
  uploadObject?: typeof uploadObject;
  loadCredentials?: typeof loadWorkspaceTwilioCredentials;
};

export type PersistCallRecordingResult =
  | { ok: true; audioUrl: string; skipped: false }
  | { ok: true; audioUrl: string; skipped: true; reason: "already_persisted" }
  | {
      ok: false;
      reason: "missing_credentials" | "download_failed" | "upload_failed";
      error: string;
    };

export async function persistCallRecordingToStorage(
  args: PersistCallRecordingArgs,
  deps: PersistCallRecordingDeps = {},
): Promise<PersistCallRecordingResult> {
  const objectPath = callRecordingStoragePath(args.workspaceId, args.callSid);

  if (args.existingAudioUrl?.trim()) {
    return {
      ok: true,
      audioUrl: args.existingAudioUrl.trim(),
      skipped: true,
      reason: "already_persisted",
    };
  }

  const loadCredentials = deps.loadCredentials ?? loadWorkspaceTwilioCredentials;
  const creds = await loadCredentials(args.workspaceId);
  if (!creds) {
    return {
      ok: false,
      reason: "missing_credentials",
      error: "Workspace Twilio credentials not found",
    };
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = await fetchTwilioRecordingMp3(
      args.accountSid,
      args.recordingSid,
      creds,
      deps,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "download_failed", error: message };
  }

  const upload = deps.uploadObject ?? uploadObject;
  try {
    await upload("workspaceAudio", objectPath, audioBuffer, {
      contentType: NORMALIZED_AUDIO_CONTENT_TYPE,
      cacheControl: "60",
      upsert: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "upload_failed", error: message };
  }

  return { ok: true, audioUrl: objectPath, skipped: false };
}
