import { isWavFileName } from "@/lib/ivr-wav.server";

/**
 * WAV sidecar backfill (#1842): generate `ivr-wav/` sidecars for EXISTING
 * workspace-audio prompts that never got one (uploads and clip saves since
 * #1968 write sidecars at write time; older prompts and in-browser `recorded-*`
 * files did not).
 *
 * The prompt filter mirrors `isWorkspaceAudioFile` in platform-media.server.ts:
 * Twilio call recordings (`recording-*`) and voicemail objects are excluded;
 * `recorded-*` browser recordings ARE prompts and get a sidecar.
 *
 * Deps are injected so the scan/decision logic is unit-testable; the CLI
 * (`scripts/gen-wav-sidecars.ts`) wires the real S3/DB seam.
 */

export type WavBackfillDeps = {
  listWorkspaceIds: () => Promise<string[]>;
  /** Library file names under the workspace (leaf names, no leading prefix). */
  listPromptObjects: (workspaceId: string) => Promise<string[]>;
  sidecarExists: (workspaceId: string, fileName: string) => Promise<boolean>;
  /** Must throw on failure so the per-file error is recorded. */
  writeSidecar: (workspaceId: string, fileName: string) => Promise<void>;
};

export type WavBackfillOptions = {
  /** Regenerate sidecars that already exist. */
  force?: boolean;
  /** Cap the number of files processed per workspace. */
  limit?: number;
  /** Scan and report only; never write. */
  dryRun?: boolean;
};

export type WavBackfillResult = {
  workspaceId: string;
  scanned: number;
  created: number;
  skippedExisting: number;
  failures: Array<{ fileName: string; error: string }>;
};

function isPromptFile(fileName: string): boolean {
  // The caller's list inputs only library prompts (`<ws>/` prefix); voicemails
  // (`voicemail/<ws>/`) and call recordings (`call-recordings/<ws>/`) never
  // appear there, so no name heuristics are needed.
  return !isWavFileName(fileName);
}

export async function backfillWorkspaceWavs(
  workspaceId: string,
  deps: WavBackfillDeps,
  options: WavBackfillOptions = {},
): Promise<WavBackfillResult> {
  const allFiles = await deps.listPromptObjects(workspaceId);
  const candidates = allFiles.filter(isPromptFile);
  const limited =
    options.limit != null ? candidates.slice(0, options.limit) : candidates;

  const result: WavBackfillResult = {
    workspaceId,
    scanned: candidates.length,
    created: 0,
    skippedExisting: 0,
    failures: [],
  };

  for (const fileName of limited) {
    if (!options.force && (await deps.sidecarExists(workspaceId, fileName))) {
      result.skippedExisting += 1;
      continue;
    }
    if (options.dryRun) {
      result.created += 1;
      continue;
    }
    try {
      await deps.writeSidecar(workspaceId, fileName);
      result.created += 1;
    } catch (error) {
      result.failures.push({
        fileName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export type WavBackfillRunResult = {
  workspaces: WavBackfillResult[];
  scanned: number;
  created: number;
  skippedExisting: number;
  failures: number;
  errors: string[];
};

/** Iterate workspaces and backfill each, isolating per-workspace failures. */
export async function runWavBackfill(
  deps: WavBackfillDeps,
  options: WavBackfillOptions & { workspaceId?: string } = {},
): Promise<WavBackfillRunResult> {
  const ids = options.workspaceId ? [options.workspaceId] : await deps.listWorkspaceIds();
  const workspaces: WavBackfillResult[] = [];
  const errors: string[] = [];

  for (const workspaceId of ids) {
    try {
      workspaces.push(
        await backfillWorkspaceWavs(workspaceId, deps, options),
      );
    } catch (error) {
      errors.push(
        `${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    workspaces,
    scanned: workspaces.reduce((sum, row) => sum + row.scanned, 0),
    created: workspaces.reduce((sum, row) => sum + row.created, 0),
    skippedExisting: workspaces.reduce((sum, row) => sum + row.skippedExisting, 0),
    failures: workspaces.reduce((sum, row) => sum + row.failures.length, 0),
    errors,
  };
}