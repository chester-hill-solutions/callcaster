import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
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

  it("does not report unmodeled deployed endpoint values as drift", () => {
    const result = compareRuntimeConfig("dev", {
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

  it("reports CLI failures without values, stacks, or machine paths", () => {
    const secretEndpoint = "https://user:token@bad.example.invalid/[";
    const result = spawnSync(
      "npx",
      ["--no-install", "tsx", "--tsconfig", "tsconfig.json", resolve("scripts/compare-runtime-config.mjs"), "--environment", "qa"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, ENDPOINT: secretEndpoint },
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

  it("does not read runtime values for production", () => {
    const env = new Proxy({}, { get() { throw new Error("runtime env was read"); } }) as NodeJS.ProcessEnv;
    expect(compareRuntimeConfig("production", env)).toEqual({
      enabled: false,
      environment: "production",
      reason: "disabled-for-production",
    });
  });
});
