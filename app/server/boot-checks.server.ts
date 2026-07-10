import { HeadBucketCommand } from "@aws-sdk/client-s3";
import {
  getS3Client,
  listConfiguredBuckets,
} from "@/lib/object-storage.server";
import { twilio } from "@/twilio.server";
import { env } from "@/lib/env.server";

type LogLevel = "info" | "warn" | "error";

/**
 * Structured JSON logger matching the convention in server/bun.ts. Kept as a
 * local copy (rather than importing from server/bun.ts) so this module has
 * no dependency on the Bun-only server entrypoint and can be unit tested
 * under vitest/node.
 */
function log(level: LogLevel, message: string, details?: unknown) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    ...(details && typeof details === "object"
      ? details
      : { detail: details }),
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

async function checkS3Buckets(): Promise<void> {
  const buckets = listConfiguredBuckets();
  const client = getS3Client();

  await Promise.all(
    buckets.map(async ({ envVar, bucketName }) => {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucketName }));
      } catch (error) {
        log(
          "error",
          `S3 bucket '${bucketName}' (${envVar}) not reachable — recordings/uploads will fail on first use`,
          {
            envVar,
            bucketName,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }),
  );
}

async function checkTwilioCredentials(): Promise<void> {
  try {
    const sid = env.TWILIO_SID();
    await twilio.api.v2010.accounts(sid).fetch();
  } catch (error) {
    log("error", "Twilio credentials invalid — calls/SMS will fail", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Fire-and-forget boot-time smoke checks for external dependencies (S3
 * buckets, Twilio credentials). Called after the server starts listening —
 * never delays or blocks readiness, and never throws or exits, since review
 * environments may intentionally run without real credentials.
 *
 * Skipped entirely under E2E_TEST=1, where the E2E harness runs with
 * placeholder creds by design.
 */
export async function runBootSmokeChecks(
  processEnv: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (processEnv.E2E_TEST === "1") {
    return;
  }

  try {
    await Promise.all([checkS3Buckets(), checkTwilioCredentials()]);
  } catch (error) {
    // Belt-and-suspenders: individual checks already catch their own
    // errors, but this must never throw regardless.
    log("error", "boot smoke checks failed unexpectedly", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
