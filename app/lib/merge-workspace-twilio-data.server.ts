import { eq, or, sql } from "drizzle-orm";
import { workspace as workspaceTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { isObject } from "@/lib/type-safety-utils";

export type WorkspaceTwilioData = Record<string, unknown>;

/**
 * Resolve a workspace id from a Twilio AccountSid embedded in `workspace.twilio_data`.
 * Used as a webhook-auth fallback when the call/message row is not yet visible
 * (create→insert race on outbound IVR/SMS).
 */
export async function findWorkspaceIdByTwilioAccountSid(
  accountSid: string,
): Promise<string | null> {
  const trimmed = accountSid.trim();
  if (!trimmed) return null;

  const rows = await adminDb
    .select({ id: workspaceTable.id })
    .from(workspaceTable)
    .where(
      or(
        sql`${workspaceTable.twilio_data}->>'sid' = ${trimmed}`,
        sql`${workspaceTable.twilio_data}->>'account_sid' = ${trimmed}`,
        sql`${workspaceTable.twilio_data}->>'accountSid' = ${trimmed}`,
      ),
    )
    .limit(1);

  return rows[0]?.id ?? null;
}

/**
 * Per-process, in-memory TTL cache for `workspace.twilio_data`.
 *
 * Twilio status callbacks (voice + SMS) fire many times per call/message,
 * and each one re-resolves the workspace's Twilio credentials to validate
 * the webhook signature and route the request. Credentials rarely change,
 * so we cache the parsed value for a short TTL per workspace and bust it on
 * writes.
 *
 * This is a per-process cache only (not shared across server
 * instances/replicas, and cleared on restart). That's an acceptable
 * tradeoff: the worst case is a stale credential read for up to
 * WORKSPACE_TWILIO_DATA_CACHE_TTL_MS after a rotation on a given process,
 * not a weakened signature check — every request is still verified against
 * whichever token is resolved.
 */
const WORKSPACE_TWILIO_DATA_CACHE_TTL_MS = 60_000;

type CacheEntry = { data: WorkspaceTwilioData; expiresAt: number };

const workspaceTwilioDataCache = new Map<string, CacheEntry>();

/**
 * Monotonic per-workspace version, bumped every time the cache is busted.
 * Lets other in-process caches derived from workspace Twilio credentials
 * (e.g. the memoized Twilio client in workspace.server.ts) detect that
 * credentials changed without reaching into this module's cache internals.
 */
const workspaceTwilioDataVersion = new Map<string, number>();

export function getWorkspaceTwilioDataVersion(workspaceId: string): number {
  return workspaceTwilioDataVersion.get(workspaceId) ?? 0;
}

/**
 * Bust the cached Twilio data (and bump the version) for a workspace.
 * Must be called after any write to `workspace.twilio_data` for that
 * workspace, from any code path.
 */
export function invalidateWorkspaceTwilioData(workspaceId: string): void {
  workspaceTwilioDataCache.delete(workspaceId);
  workspaceTwilioDataVersion.set(
    workspaceId,
    (workspaceTwilioDataVersion.get(workspaceId) ?? 0) + 1,
  );
}

/** Parse the raw `twilio_data` column (json or json-string) into an object. */
function parseTwilioData(raw: unknown): WorkspaceTwilioData {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return isObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isObject(raw) ? raw : {};
}

/** Drop the derived `onboarding.steps` before persisting — it is recomputed on read. */
function stripOnboardingStepsForPersistence(
  twilioData: WorkspaceTwilioData,
): WorkspaceTwilioData {
  const onboarding = twilioData.onboarding;
  return isObject(onboarding) && "steps" in onboarding
    ? {
        ...twilioData,
        onboarding: (({ steps: _steps, ...rest }) => rest)(onboarding),
      }
    : twilioData;
}

export async function loadWorkspaceTwilioData(
  workspaceId: string,
): Promise<WorkspaceTwilioData> {
  const cached = workspaceTwilioDataCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    // Defensive clone: callers must not be able to corrupt the cache (or
    // each other) by mutating the object they got back.
    return structuredClone(cached.data);
  }

  const [row] = await adminDb
    .select({ twilio_data: workspaceTable.twilio_data })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);

  if (!row) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  const data = parseTwilioData(row.twilio_data);

  workspaceTwilioDataCache.set(workspaceId, {
    data,
    expiresAt: Date.now() + WORKSPACE_TWILIO_DATA_CACHE_TTL_MS,
  });

  return structuredClone(data);
}

export async function persistWorkspaceTwilioData(
  workspaceId: string,
  twilioData: WorkspaceTwilioData,
): Promise<void> {
  await adminDb
    .update(workspaceTable)
    .set({ twilio_data: JSON.stringify(stripOnboardingStepsForPersistence(twilioData)) })
    .where(eq(workspaceTable.id, workspaceId));
  invalidateWorkspaceTwilioData(workspaceId);
}

/**
 * Atomically read-modify-write `workspace.twilio_data`.
 *
 * `twilio_data` is a single JSON blob written by many unrelated code paths
 * (onboarding, A2P/Trust Hub provisioning, billing reconciliation, low-credit
 * notices). A plain load→spread→persist is a read-modify-write with no lock,
 * so two concurrent writers each overwrite the whole column and the later one
 * silently wipes the earlier one's keys (e.g. an onboarding save clobbering a
 * brandSid/campaignSid the compliance job just wrote). It is also served from
 * a per-process TTL cache, so a writer could re-serialize stale data.
 *
 * This runs the updater inside a transaction that locks the row (`FOR UPDATE`)
 * and reads the row FRESH from the database — never the cache — so concurrent
 * merges serialize on the row and every merge sees the latest committed value.
 */
export async function mergeWorkspaceTwilioData(
  workspaceId: string,
  updater: (current: WorkspaceTwilioData) => WorkspaceTwilioData,
): Promise<WorkspaceTwilioData> {
  const next = await adminDb.transaction(async (tx) => {
    const [row] = await tx
      .select({ twilio_data: workspaceTable.twilio_data })
      .from(workspaceTable)
      .where(eq(workspaceTable.id, workspaceId))
      .for("update")
      .limit(1);

    if (!row) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const merged = updater(parseTwilioData(row.twilio_data));

    await tx
      .update(workspaceTable)
      .set({ twilio_data: JSON.stringify(stripOnboardingStepsForPersistence(merged)) })
      .where(eq(workspaceTable.id, workspaceId));

    return merged;
  });

  invalidateWorkspaceTwilioData(workspaceId);
  return next;
}

export async function patchWorkspaceTwilioData(
  workspaceId: string,
  patch: WorkspaceTwilioData,
): Promise<WorkspaceTwilioData> {
  return mergeWorkspaceTwilioData(workspaceId, (current) => ({
    ...current,
    ...patch,
  }));
}
