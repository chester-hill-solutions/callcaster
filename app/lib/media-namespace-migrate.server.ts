/**
 * Media-namespace migration: move legacy voicemail and call-recording objects
 * out of the workspace-audio library prefix into their own namespaces.
 *
 * Before this split, inbound voicemails lived at `<ws>/voicemail-*.mp3` and
 * Twilio call recordings at `<ws>/recording-*.mp3` — inside the exact prefix
 * the library picker lists, so caller audio mixed with prompts and every
 * consumer carried `voicemail-`/`recording-` name heuristics. New objects are
 * written to `voicemail/<ws>/` and `call-recordings/<ws>/`; this moves the
 * pre-split objects to match (copy + verify-able delete, per object).
 */

import { isLegacyVoicemailObjectName } from "@/lib/voicemail-media.server";

export const CALL_RECORDINGS_OBJECT_PREFIX = "call-recordings";

/** Destination key for a legacy `<ws>/<name>` object, or null when it is not call media. */
export function mediaNamespaceTarget(
  workspaceId: string,
  legacyName: string,
): string | null {
  if (isLegacyVoicemailObjectName(legacyName)) {
    return `voicemail/${workspaceId}/${legacyName}`;
  }
  if (legacyName.startsWith("recording-")) {
    return `call-recordings/${workspaceId}/${legacyName}`;
  }
  return null;
}

export type MediaNamespaceMigrateDeps = {
  listWorkspaceIds: () => Promise<string[]>;
  /** Basenames of objects under `<workspaceId>/` (the legacy library prefix). */
  listLegacyObjects: (workspaceId: string) => Promise<string[]>;
  copyObject: (sourcePath: string, targetPath: string) => Promise<void>;
  deleteObject: (objectPath: string) => Promise<void>;
};

export type MediaNamespaceMigrateWorkspaceResult = {
  workspaceId: string;
  voicemails: number;
  callRecordings: number;
  failures: Array<{ objectPath: string; error: string }>;
};

export type MediaNamespaceMigrateResult = {
  workspaces: MediaNamespaceMigrateWorkspaceResult[];
  voicemails: number;
  callRecordings: number;
  failures: number;
  errors: string[];
};

export async function migrateWorkspaceMediaNamespaces(
  workspaceId: string,
  deps: MediaNamespaceMigrateDeps,
  options: { dryRun?: boolean } = {},
): Promise<MediaNamespaceMigrateWorkspaceResult> {
  const result: MediaNamespaceMigrateWorkspaceResult = {
    workspaceId,
    voicemails: 0,
    callRecordings: 0,
    failures: [],
  };

  const legacyNames = await deps.listLegacyObjects(workspaceId);
  for (const name of legacyNames) {
    const target = mediaNamespaceTarget(workspaceId, name);
    if (!target) continue;
    if (target.startsWith("voicemail/")) result.voicemails += 1;
    else result.callRecordings += 1;

    if (options.dryRun) continue;

    const source = `${workspaceId}/${name}`;
    try {
      await deps.copyObject(source, target);
      await deps.deleteObject(source);
    } catch (error) {
      result.failures.push({
        objectPath: source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/** Run across all workspaces, isolating per-workspace failures. */
export async function runMediaNamespaceMigrate(
  deps: MediaNamespaceMigrateDeps,
  options: { dryRun?: boolean; workspaceId?: string } = {},
): Promise<MediaNamespaceMigrateResult> {
  const ids = options.workspaceId ? [options.workspaceId] : await deps.listWorkspaceIds();
  const workspaces: MediaNamespaceMigrateWorkspaceResult[] = [];
  const errors: string[] = [];

  for (const workspaceId of ids) {
    try {
      workspaces.push(
        await migrateWorkspaceMediaNamespaces(workspaceId, deps, options),
      );
    } catch (error) {
      errors.push(
        `${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    workspaces,
    voicemails: workspaces.reduce((sum, row) => sum + row.voicemails, 0),
    callRecordings: workspaces.reduce((sum, row) => sum + row.callRecordings, 0),
    failures: workspaces.reduce((sum, row) => sum + row.failures.length, 0),
    errors,
  };
}