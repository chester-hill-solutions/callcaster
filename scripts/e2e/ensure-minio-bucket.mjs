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

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`[e2e-minio] bucket ${bucket} already exists`);
} catch {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`[e2e-minio] created bucket ${bucket}`);
}
