import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { environmentNames } from "../config/schema";
import { loadResolvedConfig, loadResolvedLocalConfig, redactResolvedConfig, stableFingerprint, stableJson } from "../config/resolved";

describe("resolved configuration output", () => {
  it.each(environmentNames)("resolves and reports %s", (environment) => {
    const report = loadResolvedConfig(environment);
    expect(report.environment).toBe(environment);
    expect(report.schemaVersion).toBe(1);
    expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(report.inheritance.chain.at(-1)).toBe(environment);
  });

  it("contains only secret names and no secret-shaped values", () => {
    const report = loadResolvedConfig("local");
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/(do-not-print|super-secret|token-value|password-value|postgres:\/\/)/i);
    expect(serialized).not.toContain("process.env");

    const malicious = {
      environment: "local",
      secretProvider: "dotenv",
      runtime: { mode: "development" },
      urls: {},
      storage: {},
      services: {
        app: { enabled: true, secrets: [{ name: "DATABASE_URL" }], apiKey: "do-not-print" },
        worker: { enabled: true, secrets: [] },
        "media-stream": { enabled: true, secrets: [] },
        sim: { enabled: true, secrets: [] },
      },
      databaseUrl: "postgres://do-not-print",
    } as never;
    const redacted = JSON.stringify(redactResolvedConfig(malicious));
    expect(redacted).toContain("DATABASE_URL");
    expect(redacted).not.toContain("do-not-print");
  });

  it("uses stable ordering and deterministic fingerprints", () => {
    const first = loadResolvedConfig("local");
    const second = loadResolvedConfig("local");
    expect(first).toEqual(second);
    const firstOrdering = { z: 1, a: { d: true, c: false } };
    const secondOrdering = { a: { c: false, d: true }, z: 1 };
    expect(stableJson(firstOrdering)).toBe(stableJson(secondOrdering));
    expect(stableFingerprint(firstOrdering)).toBe(stableFingerprint(secondOrdering));
    expect(JSON.stringify(first)).toContain('"environment"');
    expect(JSON.stringify(first).indexOf('"environment"')).toBeLessThan(JSON.stringify(first).indexOf('"fingerprint"'));
  });

  it("reports dynamic local identity and fingerprints it deterministically", () => {
    const input = { devName: "alex", envName: "local" as const };
    const first = loadResolvedLocalConfig(input);
    const second = loadResolvedLocalConfig(input);
    expect(first.identity).toEqual({
      devName: "alex",
      envName: "local",
      profileName: "alex-local",
      hostname: "alex-local.callcaster.ca",
      publicUrl: "https://alex-local.callcaster.ca",
    });
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(/(do-not-print|token-value|password-value|postgres:\/\/)/i);
  });

  it("rejects invalid command input without printing configuration", () => {
    const result = spawnSync(
      "npx",
      ["--no-install", "tsx", resolve("scripts/config-show.ts"), "--environment", "unknown"],
      { cwd: resolve("."), encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unknown environment");
    expect(result.stdout).not.toContain("fingerprint");
  });
});
