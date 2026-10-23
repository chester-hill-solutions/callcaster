import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyDevLocalOverrides, compareRuntimeConfig } from "../config/runtime-compare";

const localEnv = {
  DEV_NAME: "sai",
  ENV: "local",
  BASE_URL: "http://localhost:3000/",
  NODE_ENV: "development",
  S3_ENDPOINT: "http://127.0.0.1:9000/",
  S3_REGION: "us-east-1",
  S3_BUCKET: "callcaster",
};

describe("runtime config comparison", () => {
  it("applies dev-local defaults without secrets or process mutation", () => {
    const input = { DEV_NAME: "sai", ENV: "local", DATABASE_URL: "secret" };
    const result = applyDevLocalOverrides(input);
    expect(result).toMatchObject({
      DEV_NAME: "sai",
      ENV: "local",
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_REGION: "us-east-1",
      S3_BUCKET: "callcaster",
      S3_FORCE_PATH_STYLE: "true",
      NODE_ENV: "development",
      BASE_URL: "http://localhost:3000",
    });
    expect(result).not.toHaveProperty("DATABASE_URL");
    expect(input).toEqual({ DEV_NAME: "sai", ENV: "local", DATABASE_URL: "secret" });
  });

  it("uses local defaults for an absent NODE_ENV in standard mode", async () => {
    const result = await compareRuntimeConfig("local", {
      DEV_NAME: "sai",
      ENV: "local",
      BASE_URL: "http://localhost:3000",
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_REGION: "us-east-1",
      S3_BUCKET: "callcaster",
    });
    expect(result).toMatchObject({ enabled: true, mismatches: [] });
  });

  it("makes dev-local defaults match a local profile without BASE_URL", async () => {
    const result = await compareRuntimeConfig("local", {
      DEV_NAME: "sai",
      ENV: "local",
    }, { localMode: "dev-local" });
    expect(result).toMatchObject({ enabled: true, mismatches: [] });
  });

  it("matches local values and canonicalizes URL slashes", async () => {
    const result = await compareRuntimeConfig("local", localEnv);
    expect(result).toMatchObject({ enabled: true, mismatches: [] });
  });

  it("uses S3 aliases before Railway and AWS-compatible aliases", async () => {
    const result = await compareRuntimeConfig("local", {
      ...localEnv,
      ENDPOINT: "https://storage.railway.app",
      REGION: "iad",
      BUCKET: "wrong",
      AWS_DEFAULT_REGION: "wrong-too",
    });
    expect(result.enabled && result.mismatches).toEqual([]);
  });

  it("reports safe mismatch paths and categories without values", async () => {
    const result = await compareRuntimeConfig("qa", {
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

  it("does not report unmodeled deployed endpoint values as drift", async () => {
    const result = await compareRuntimeConfig("dev", {
      BASE_URL: "https://dev.callcaster.ca",
      NODE_ENV: "production",
      ENDPOINT: "https://storage.railway.app",
      REGION: "iad",
      BUCKET: "callcaster-dev",
    });
    expect(result.enabled && result.mismatches).not.toEqual(expect.arrayContaining([
      { path: "storage.endpoint", category: "unexpected" },
      { path: "storage.urlStyle", category: "unexpected" },
    ]));
  });

  it.each([
    {
      environment: "dev" as const,
      baseUrl: "https://dev.callcaster.ca",
      bucket: "callcaster-dev",
    },
    {
      environment: "qa" as const,
      baseUrl: "https://qa.callcaster.ca",
      bucket: "callcaster-staging",
    },
  ])("matches modeled $environment values despite a Railway endpoint", async ({ environment, baseUrl, bucket }) => {
    const result = await compareRuntimeConfig(environment, {
      BASE_URL: baseUrl,
      NODE_ENV: "production",
      ENDPOINT: "https://storage.railway.app",
      REGION: "iad",
      BUCKET: bucket,
    });
    expect(result).toMatchObject({ enabled: true, mismatches: [] });
    if (result.enabled) expect(result.expectedFingerprint).toBe(result.observedFingerprint);
  });

  it("reports CLI failures without values, stacks, or machine paths", () => {
    const secretEndpoint = "https://user:token@[bad.example.invalid";
    const result = spawnSync(
      "npx",
      ["--no-install", "tsx", "--tsconfig", "tsconfig.json", resolve("scripts/compare-runtime-config.mjs"), "--environment", "qa"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, S3_ENDPOINT: secretEndpoint, ENDPOINT: secretEndpoint },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toBe("runtime config comparison failed\n");
    expect(result.stderr).not.toContain(secretEndpoint);
    expect(result.stderr).not.toContain("at ");
    expect(result.stderr).not.toContain(process.cwd());
  });

  it("rejects invalid CLI arguments without a stack", () => {
    const result = spawnSync(
      "npx",
      ["--no-install", "tsx", "--tsconfig", "tsconfig.json", resolve("scripts/compare-runtime-config.mjs"), "--environment", "unknown"],
      { cwd: resolve("."), encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toBe("unknown environment\n");
    expect(result.stderr).not.toContain("at ");
  });

  it("does not read runtime values for production", async () => {
    const env = new Proxy({}, { get() { throw new Error("runtime env was read"); } }) as NodeJS.ProcessEnv;
    await expect(compareRuntimeConfig("production", env)).resolves.toEqual({
      enabled: false,
      environment: "production",
      reason: "disabled-for-production",
    });
  });
});
