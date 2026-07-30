import { describe, expect, test } from "vitest";

import { validateWorkerEnv } from "@/lib/worker/validate-worker-env";

/** A worker environment that should boot. */
function completeEnv(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgres://x",
    BETTER_AUTH_SECRET: "s",
    TWILIO_SID: "AC1",
    TWILIO_AUTH_TOKEN: "t",
    TWILIO_APP_SID: "AP1",
    TWILIO_PHONE_NUMBER: "+15555550100",
    BASE_URL: "https://example.com",
    STRIPE_SECRET_KEY: "sk_test_x",
    RESEND_API_KEY: "re_x",
    S3_ENDPOINT: "http://s3",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "k",
    S3_SECRET_ACCESS_KEY: "s",
    S3_BUCKET: "b",
  };
}

describe("validateWorkerEnv", () => {
  test("accepts a fully configured worker environment", () => {
    expect(() => validateWorkerEnv(completeEnv())).not.toThrow();
  });

  // The worker used to check DATABASE_URL only, so a missing provider
  // credential let it boot green and then dead-letter every job that touched
  // that provider — including both billing debit paths.
  test.each([
    "TWILIO_SID",
    "TWILIO_AUTH_TOKEN",
    "STRIPE_SECRET_KEY",
    "RESEND_API_KEY",
    "BASE_URL",
  ])("refuses to boot without %s", (key) => {
    const env = completeEnv();
    delete env[key];
    expect(() => validateWorkerEnv(env)).toThrow(new RegExp(key));
  });

  test("refuses to boot without object storage (audience_upload needs it)", () => {
    const env = completeEnv();
    delete env.S3_BUCKET;
    expect(() => validateWorkerEnv(env)).toThrow(/object storage/i);
  });

  test("accepts Railway bucket credentials instead of S3_*", () => {
    const env = completeEnv();
    for (const k of [
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_BUCKET",
    ]) {
      delete env[k];
    }
    Object.assign(env, {
      ENDPOINT: "http://s3",
      REGION: "us-east-1",
      ACCESS_KEY_ID: "k",
      SECRET_ACCESS_KEY: "s",
      BUCKET: "b",
    });
    expect(() => validateWorkerEnv(env)).not.toThrow();
  });
});
