import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ConfigValidationError,
  parseProjectConfig,
  SecretReferenceSchema,
  SecretNameSchema,
  validateInheritanceGraph,
} from "../config/schema";
import { environmentConfigs, loadProjectConfig } from "../config/load";
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

  it("loads every checked-in environment with inherited defaults", () => {
    for (const environment of ["local", "sai-local", "dev", "qa", "production"] as const) {
      const config = loadProjectConfig(environment);
      expect(config.environment).toBe(environment);
      expect(config.services.app.enabled).toBe(true);
      expect(config.services.worker.secrets).toEqual([]);
    }
    expect(loadProjectConfig("sai-local").storage.endpoint).toBe("http://127.0.0.1:9000");
    expect(loadProjectConfig("dev").urls.publicApp).toBe("https://dev.callcaster.ca");
  });

  it("merges child overrides without copying defaults into overlays", () => {
    expect(environmentConfigs["sai-local"]).toEqual({ environment: "sai-local", parent: "local" });
    const config = loadProjectConfig("sai-local", {
      local: { environment: "local", storage: { endpoint: "https://storage.example.test", host: "storage.example.test" } },
      "sai-local": { environment: "sai-local", parent: "local", storage: { bucket: "sai" } },
    });
    expect(config.storage).toMatchObject({ endpoint: "https://storage.example.test", host: "storage.example.test", bucket: "sai" });
    expect(config.services.app).toEqual({ enabled: true, secrets: [] });
  });

  it("rejects strict overlays and invalid final inherited configurations", () => {
    expect(() => loadProjectConfig("local", { local: { environment: "local", typo: true } })).toThrow(ConfigValidationError);
    expect(() =>
      loadProjectConfig("sai-local", {
        local: { environment: "local", storage: { endpoint: "https://one.example.test", host: "one.example.test" } },
        "sai-local": { environment: "sai-local", parent: "local", storage: { host: "two.example.test" } },
      }),
    ).toThrow(/host must match endpoint hostname/);
  });

  it("keeps overlays free of secret values", () => {
    const serialized = JSON.stringify(environmentConfigs);
    expect(serialized).not.toMatch(/(SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL)/i);
    expect(serialized).not.toContain("secretProvider");
  });
});
