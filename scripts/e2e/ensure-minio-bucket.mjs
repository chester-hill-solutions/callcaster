#!/usr/bin/env node
/* eslint-env node */
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000";
const bucket = process.env.S3_BUCKET ?? "callcaster";

const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "callcaster",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "callcaster-dev-secret",
  },
  forcePathStyle: true,
});

// MinIO may still be starting when compose reports the container as running —
// retry connection-level failures for up to ~30s before giving up.
const MAX_ATTEMPTS = 15;
const RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureBucket() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`[e2e-minio] bucket ${bucket} already exists`);
    return;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    // 404/403 means MinIO answered — the bucket just doesn't exist yet.
    if (status !== 404 && status !== 403 && status !== 301) {
      throw error;
    }
  }
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`[e2e-minio] created bucket ${bucket}`);
}

let lastError;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    await ensureBucket();
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.log(
      `[e2e-minio] attempt ${attempt}/${MAX_ATTEMPTS} failed (${error?.code ?? error?.name ?? "error"}); retrying in ${RETRY_DELAY_MS}ms…`,
    );
    await sleep(RETRY_DELAY_MS);
  }
}

console.error(`[e2e-minio] could not reach MinIO at ${endpoint}`);
console.error(lastError);
process.exit(1);
