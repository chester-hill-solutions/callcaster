import { describe, expect, it } from "vitest";
import { compareRuntimeConfig } from "../config/runtime-compare";

const localEnv = {
  BASE_URL: "http://localhost:3000/",
  NODE_ENV: "development",
  S3_ENDPOINT: "http://127.0.0.1:9000/",
  S3_REGION: "us-east-1",
  S3_BUCKET: "callcaster",
};

describe("runtime config comparison", () => {
  it("matches local values and canonicalizes URL slashes", () => {
    const result = compareRuntimeConfig("local", localEnv);
    expect(result).toMatchObject({ enabled: true, mismatches: [] });
  });

  it("uses S3 aliases before Railway and AWS-compatible aliases", () => {
    const result = compareRuntimeConfig("sai-local", {
      ...localEnv,
      ENDPOINT: "https://storage.railway.app",
      REGION: "iad",
      BUCKET: "wrong",
      AWS_DEFAULT_REGION: "wrong-too",
    });
    expect(result.enabled && result.mismatches).toEqual([]);
  });

  it("reports safe mismatch paths and categories without values", () => {
    const result = compareRuntimeConfig("qa", {
      BASE_URL: "https://wrong.example",
      NODE_ENV: "development",
      ENDPOINT: "https://storage.railway.app",
      REGION: "wrong-region",
      BUCKET: "wrong-bucket",
    });
    expect(result.enabled).toBe(true);
    expect(result.mismatches).toEqual(expect.arrayContaining([
      { path: "urls.publicApp", category: "different" },
      { path: "runtime.mode", category: "different" },
      { path: "storage.region", category: "different" },
      { path: "storage.bucket", category: "different" },
    ]));
    expect(JSON.stringify(result)).not.toMatch(/wrong|callcaster-staging|https:\/\//);
  });

  it("does not read runtime values for production", () => {
    const env = new Proxy({}, { get() { throw new Error("runtime env was read"); } }) as NodeJS.ProcessEnv;
    expect(compareRuntimeConfig("production", env)).toEqual({
      enabled: false,
      environment: "production",
      reason: "disabled-for-production",
    });
  });
});
