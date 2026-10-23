import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ConfigValidationError,
  LocalProfileInputSchema,
  parseProjectConfig,
  ProjectConfigOverlaySchema,
  SecretReferenceSchema,
  SecretNameSchema,
  ServiceSliceSchema,
  safeParseProjectConfig,
} from "../config/schema";
import { secretNames } from "../config/secret-names";

const phaseZeroCatalog = JSON.parse(
  readFileSync(new URL("../scripts/configuration-inventory/catalog.json", import.meta.url), "utf8"),
) as { entries: Array<{ key: string; classification: string }> };

const valid = {
  environment: "local",
  urls: { publicApp: "https://local.example.test" },
  storage: { endpoint: "https://storage.example.test", host: "storage.example.test" },
  services: { app: { secrets: [{ name: "DATABASE_URL" }] } },
};

describe("ProjectConfig schema", () => {
  it("parses strict config and applies safe defaults", () => {
    const config = parseProjectConfig(valid);
    expect(config.runtime.mode).toBe("development");
    expect(config.secretProvider).toBe("dotenv");
    expect(config.services).toEqual({
      app: { enabled: true, secrets: [{ name: "DATABASE_URL" }] },
      worker: { enabled: true, secrets: [] },
      "media-stream": { enabled: true, secrets: [] },
      sim: { enabled: true, secrets: [] },
    });
  });

  it("rejects unknown keys, unlisted secret names, and secret values or providers", () => {
    expect(() => parseProjectConfig({ ...valid, unexpected: true })).toThrow(ConfigValidationError);
    expect(SecretNameSchema.safeParse("MADE_UP_SECRET").success).toBe(false);
    expect(SecretNameSchema.safeParse("DATABASE_URL").success).toBe(true);
    expect(SecretReferenceSchema.safeParse({ name: "DATABASE_URL", value: "secret" }).success).toBe(false);
    expect(SecretReferenceSchema.safeParse({ name: "DATABASE_URL", provider: "dotenv" }).success).toBe(false);
  });

  it("keeps the typed secret-name catalog equal to the Phase 0 classification catalog", () => {
    const classifiedSecretNames = phaseZeroCatalog.entries
      .filter((entry) => entry.classification === "secret")
      .map((entry) => entry.key);

    expect(new Set(classifiedSecretNames).size).toBe(classifiedSecretNames.length);
    expect(secretNames).toEqual(classifiedSecretNames);
  });

  it("matches providers to the local and Railway deployment topology", () => {
    expect(parseProjectConfig({ ...valid, environment: "dev" }).secretProvider).toBe("railway");
    expect(parseProjectConfig({ ...valid, environment: "qa" }).secretProvider).toBe("railway");
    expect(parseProjectConfig({ ...valid, environment: "production" }).secretProvider).toBe("railway");
    expect(parseProjectConfig({ ...valid, environment: "dev", secretProvider: "railway" }).secretProvider).toBe("railway");
    expect(parseProjectConfig({ ...valid, environment: "qa", secretProvider: "railway" }).secretProvider).toBe("railway");
    expect(parseProjectConfig({ ...valid, environment: "production", secretProvider: "railway" }).secretProvider).toBe("railway");
    expect(() => parseProjectConfig({ ...valid, environment: "local", secretProvider: "railway" })).toThrow(
      /not valid for local/,
    );
    expect(() => parseProjectConfig({ ...valid, environment: "dev", secretProvider: "dotenv" })).toThrow(
      /not valid for dev/,
    );
  });

  it("rejects invalid URL/host combinations and unknown service keys", () => {
    expect(() => parseProjectConfig({ ...valid, storage: { endpoint: "https://one.test", host: "two.test" } })).toThrow(
      /match endpoint hostname/,
    );
    expect(() => parseProjectConfig({ ...valid, services: { api: {} } })).toThrow(ConfigValidationError);
    expect(parseProjectConfig({ ...valid, services: { sim: { enabled: false, port: 8080 } } }).services.sim).toMatchObject({
      enabled: false,
      port: 8080,
      secrets: [],
    });
  });

  it.each([
    ["credentials", "https://user:token@example.test/path"],
    ["query strings", "https://example.test/path?api_key=secret"],
    ["fragments", "https://example.test/path#frag"],
  ])("rejects %s in every resolved URL field", (_component, value) => {
    expect(() => parseProjectConfig({ ...valid, urls: { publicApp: value } })).toThrow(ConfigValidationError);
    expect(() => parseProjectConfig({ ...valid, storage: { endpoint: value } })).toThrow(ConfigValidationError);
    expect(() => parseProjectConfig({ ...valid, services: { app: { url: value } } })).toThrow(ConfigValidationError);
    expect(ProjectConfigOverlaySchema.safeParse({ environment: "local", urls: { publicApp: value } }).success).toBe(false);
    expect(ProjectConfigOverlaySchema.safeParse({ environment: "local", storage: { endpoint: value } }).success).toBe(false);
    expect(ProjectConfigOverlaySchema.safeParse({ environment: "local", services: { app: { url: value } } }).success).toBe(false);
  });

  it("rejects unsafe service URLs and keeps valid path URLs", () => {
    expect(ServiceSliceSchema.safeParse({ url: "https://example.test/path" }).success).toBe(true);
    expect(ServiceSliceSchema.safeParse({ url: "https://user:token@example.test/path?api_key=secret#frag" }).success).toBe(false);
    expect(parseProjectConfig({ ...valid, urls: { publicApp: "https://example.test/path" } }).urls.publicApp).toBe(
      "https://example.test/path",
    );
  });

  it("returns failed parses instead of throwing for malformed diagnostic URLs", () => {
    const malformed = "not-a-url";
    for (const parse of [
      () => LocalProfileInputSchema.safeParse({ devName: "sai", envName: "local", publicUrl: malformed }),
      () => ServiceSliceSchema.safeParse({ url: malformed }),
      () => ProjectConfigOverlaySchema.safeParse({ environment: "local", urls: { publicApp: malformed } }),
      () => safeParseProjectConfig({ ...valid, urls: { publicApp: malformed } }),
    ]) {
      expect(() => parse()).not.toThrow();
      expect(parse().success).toBe(false);
    }
    expect(() => parseProjectConfig({ ...valid, urls: { publicApp: malformed } })).toThrow(ConfigValidationError);
  });

});
