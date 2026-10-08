/**
 * One-shot WAV sidecar backfill (#1842): generate `ivr-wav/` sidecars for
 * existing workspace-audio prompts. Idempotent — existing sidecars are
 * skipped unless `--force`, and re-runs are safe.
 *
 * Usage:
 *   bun run scripts/gen-wav-sidecars.ts            # dry-run report
 *   bun run scripts/gen-wav-sidecars.ts --apply    # write sidecars
 *   bun run scripts/gen-wav-sidecars.ts --workspace <id> --limit 50 --force
 *
 * Requires DATABASE_URL + object-storage env (see resolveObjectStorageEnv).
 */
export {};
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
for (const key of [
  "BETTER_AUTH_SECRET",
  "TWILIO_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_APP_SID",
  "TWILIO_PHONE_NUMBER",
  "BASE_URL",
  "STRIPE_SECRET_KEY",
  "RESEND_API_KEY",
  // Object-storage group: env.server soft-validates the S3_* set.
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
]) {
  process.env[key] ??= "gen-wav-sidecars-placeholder";
}

const { runWavBackfill } = await import("@/lib/wav-backfill.server");
const { listObjects, objectExists, downloadObject, uploadObject } =
  await import("@/lib/object-storage.server");
const { transcodeToWavBuffer } = await import("@/lib/audio.server");
const { ivrWavObjectKey } = await import("@/lib/ivr-wav.server");
const { adminDb } = await import("@/server/admin-db");
const { workspace } = await import("@/db/schema");

function argFlag(flag: string): boolean {
  return process.argv.includes(flag);
}
function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] !== undefined
    ? process.argv[index + 1]
    : undefined;
}

const apply = argFlag("--apply");
const dryRun = !apply;
const force = argFlag("--force");
const workspaceId = argValue("--workspace");
const limitRaw = argValue("--limit");
const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

const result = await runWavBackfill(
  {
    listWorkspaceIds: async () => {
      const rows = await adminDb
        .select({ id: workspace.id })
        .from(workspace);
      return rows.map((row) => String(row.id));
    },
    listPromptObjects: async (id) => {
      const prefix = `${id}/`;
      const metas = await listObjects("workspaceAudio", prefix);
      return metas.map((meta) =>
        meta.name.startsWith(prefix) ? meta.name.slice(prefix.length) : meta.name,
      );
    },
    sidecarExists: (id, fileName) =>
      objectExists("workspaceAudio", ivrWavObjectKey(id, fileName)),
    writeSidecar: async (id, fileName) => {
      const source = await downloadObject("workspaceAudio", `${id}/${fileName}`);
      const wav = await transcodeToWavBuffer(source);
      if (wav.length === 0) {
        throw new Error(`transcode produced empty output for ${fileName}`);
      }
      await uploadObject("workspaceAudio", ivrWavObjectKey(id, fileName), wav, {
        contentType: "audio/wav",
        cacheControl: "60",
        upsert: true,
      });
    },
  },
  {
    workspaceId,
    force,
    limit,
    dryRun,
  },
);

console.log(
  `[gen-wav-sidecars] ${dryRun ? "DRY-RUN" : "APPLIED"}: ${result.workspaces.length} workspace(s), ` +
    `${result.scanned} prompts scanned, ${result.created} sidecars created, ` +
    `${result.skippedExisting} already present, ${result.failures} failures, ${result.errors.length} workspace error(s).`,
);
for (const row of result.workspaces) {
  if (row.created > 0 || row.failures.length > 0) {
    console.log(`  ${row.workspaceId}: ${row.created} created, ${row.failures.length} failed`);
  }
}
for (const failure of result.workspaces.flatMap((row) => row.failures)) {
  console.error(`  FAIL ${failure.fileName}: ${failure.error}`);
}
for (const error of result.errors) {
  console.error(`  WORKSPACE ERROR: ${error}`);
}

process.exit(result.failures > 0 || result.errors.length > 0 ? 2 : 0);