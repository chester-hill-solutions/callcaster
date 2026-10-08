/**
 * One-shot media-namespace migration: move legacy `<ws>/voicemail-*.mp3` and
 * `<ws>/recording-*.mp3` objects into `voicemail/<ws>/` and
 * `call-recordings/<ws>/` so caller/call audio never mixes with the workspace
 * audio library. Idempotent — re-runs are safe (already-moved objects are no
 * longer under the legacy prefix).
 *
 * Usage:
 *   bun run scripts/migrate-media-namespaces.ts            # dry-run report
 *   bun run scripts/migrate-media-namespaces.ts --apply    # copy + delete
 *   bun run scripts/migrate-media-namespaces.ts --workspace <id> --apply
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
  process.env[key] ??= "migrate-media-namespace-placeholder";
}

const { runMediaNamespaceMigrate } = await import(
  "@/lib/media-namespace-migrate.server"
);
const { copyObject, deleteObject, listObjects } = await import(
  "@/lib/object-storage.server"
);
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
const workspaceId = argValue("--workspace");

const result = await runMediaNamespaceMigrate(
  {
    listWorkspaceIds: async () => {
      const rows = await adminDb.select({ id: workspace.id }).from(workspace);
      return rows.map((row) => String(row.id));
    },
    listLegacyObjects: async (id) => {
      const metas = await listObjects("workspaceAudio", `${id}/`);
      return metas.map((meta) => meta.name);
    },
    copyObject: (source, target) =>
      copyObject("workspaceAudio", source, target),
    deleteObject: (path) => deleteObject("workspaceAudio", path),
  },
  { dryRun: !apply, workspaceId },
);

for (const row of result.workspaces) {
  console.log(
    `${row.workspaceId}: ${row.voicemails} voicemail(s), ${row.callRecordings} recording(s)${
      result.errors.length === 0 ? "" : " (workspace errored, see below)"
    }${apply ? "" : " [dry-run]"}`,
  );
  for (const failure of row.failures) {
    console.error(`  FAIL ${failure.objectPath}: ${failure.error}`);
  }
}

console.log(
  `${apply ? "Applied" : "Dry-run"}: ${result.voicemails} voicemail object(s), ${result.callRecordings} call recording(s) to move, ${result.failures} failure(s).`,
);
if (result.errors.length > 0) {
  console.error("Workspace errors:");
  for (const error of result.errors) console.error(`  ${error}`);
  process.exit(1);
}