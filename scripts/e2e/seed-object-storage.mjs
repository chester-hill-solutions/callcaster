#!/usr/bin/env node
/* eslint-env node */
/**
 * Seed MinIO objects and workspace_audio sidecar rows for E2E audio-library tests.
 *
 * MinIO is erasure-coded — objects must be written through the S3 API, not copied
 * into the container filesystem. See docs/audio-library-editing-plan.md.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import postgres from "postgres";
import { USERS, WORKSPACES } from "./seed-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

const endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000";
const bucket = process.env.S3_BUCKET ?? "callcaster";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster";

const readyWorkspaceId = WORKSPACES.ready.id;
const introFixture = path.join(rootDir, "e2e/fixtures/files/greeting.mp3");

// Values asserted in e2e/specs/audio-clip-editor.spec.ts (sidecar-backed columns).
const INTRO_DURATION_MS = 6000;
const INTRO_SIZE_BYTES = 48128;

const s3 = new S3Client({
  endpoint,
  region: process.env.S3_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "callcaster",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "callcaster-dev-secret",
  },
  forcePathStyle: true,
});

async function seedIntroAudio() {
  const body = await readFile(introFixture);
  const objectKey = `workspaceAudio/${readyWorkspaceId}/intro.mp3`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: body,
      ContentType: "audio/mpeg",
    }),
  );

  const sql = postgres(databaseUrl);
  try {
    await sql`
      INSERT INTO workspace_audio (
        workspace_id,
        file_name,
        origin,
        duration_ms,
        size_bytes,
        content_type,
        created_by
      )
      VALUES (
        ${readyWorkspaceId},
        'intro.mp3',
        'upload',
        ${INTRO_DURATION_MS},
        ${INTRO_SIZE_BYTES},
        'audio/mpeg',
        ${USERS.owner.id}
      )
      ON CONFLICT (workspace_id, file_name) DO UPDATE SET
        origin = EXCLUDED.origin,
        duration_ms = EXCLUDED.duration_ms,
        size_bytes = EXCLUDED.size_bytes,
        content_type = EXCLUDED.content_type,
        created_by = EXCLUDED.created_by,
        updated_at = now()
    `;
  } finally {
    await sql.end();
  }

  console.log(
    `[e2e-object-storage] seeded ${objectKey} with workspace_audio sidecar`,
  );
}

seedIntroAudio().catch((error) => {
  console.error("[e2e-object-storage] failed:", error);
  process.exit(1);
});
