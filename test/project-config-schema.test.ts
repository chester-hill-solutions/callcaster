import { describe, expect, it } from "vitest";
import {
  ConfigValidationError,
  parseProjectConfig,
  SecretReferenceSchema,
  SecretNameSchema,
  validateInheritanceGraph,
} from "../config/schema";

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
    expect(config.services.worker.secrets).toEqual([]);
  });

  it("rejects unknown keys, unlisted secret names, and secret values or providers", () => {
    expect(() => parseProjectConfig({ ...valid, unexpected: true })).toThrow(ConfigValidationError);
    expect(SecretNameSchema.safeParse("MADE_UP_SECRET").success).toBe(false);
    expect(SecretNameSchema.safeParse("DATABASE_URL").success).toBe(true);
    expect(SecretReferenceSchema.safeParse({ name: "DATABASE_URL", value: "secret" }).success).toBe(false);
    expect(SecretReferenceSchema.safeParse({ name: "DATABASE_URL", provider: "dotenv" }).success).toBe(false);
  });

  it("matches providers to the local and Railway deployment topology", () => {
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

  it("rejects self, circular, missing, and production parent links", () => {
    expect(() => validateInheritanceGraph({ local: { ...valid, parent: "local" } })).toThrow(/itself/);
    expect(() =>
      validateInheritanceGraph({
        local: { ...valid, parent: "dev" },
        dev: { ...valid, environment: "dev", parent: "local" },
      }),
    ).toThrow(/circular/);
    expect(() => validateInheritanceGraph({ local: { ...valid, parent: "qa" } })).toThrow(/not defined/);
    expect(() =>
      validateInheritanceGraph({ local: { ...valid, parent: "production" } }),
    ).toThrow(/production cannot/);
  });
});
