import { describe, expect, it } from "vitest";
import {
  ConfigValidationError,
  parseProjectConfig,
  SecretReferenceSchema,
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

  it("rejects unknown keys and secret values or providers", () => {
    expect(() => parseProjectConfig({ ...valid, unexpected: true })).toThrow(ConfigValidationError);
    expect(SecretReferenceSchema.safeParse({ name: "DATABASE_URL", value: "secret" }).success).toBe(false);
    expect(SecretReferenceSchema.safeParse({ name: "DATABASE_URL", provider: "dotenv" }).success).toBe(false);
  });

  it("rejects invalid environment/provider and URL/host combinations", () => {
    expect(() => parseProjectConfig({ ...valid, environment: "dev", secretProvider: "railway" })).toThrow(
      /only valid for production/,
    );
    expect(() => parseProjectConfig({ ...valid, storage: { endpoint: "https://one.test", host: "two.test" } })).toThrow(
      /match endpoint hostname/,
    );
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
