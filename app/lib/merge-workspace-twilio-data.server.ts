import { eq } from "drizzle-orm";
import { workspace as workspaceTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { isObject } from "@/lib/type-safety-utils";

export type WorkspaceTwilioData = Record<string, unknown>;

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

  const raw = row.twilio_data;
  let data: WorkspaceTwilioData;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      data = isObject(parsed) ? parsed : {};
    } catch {
      data = {};
    }
  } else {
    data = isObject(raw) ? raw : {};
  }

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
    .set({ twilio_data: JSON.stringify(twilioData) })
    .where(eq(workspaceTable.id, workspaceId));
  invalidateWorkspaceTwilioData(workspaceId);
}

export async function mergeWorkspaceTwilioData(
  workspaceId: string,
  updater: (current: WorkspaceTwilioData) => WorkspaceTwilioData,
): Promise<WorkspaceTwilioData> {
  const current = await loadWorkspaceTwilioData(workspaceId);
  const next = updater(current);
  await persistWorkspaceTwilioData(workspaceId, next);
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
