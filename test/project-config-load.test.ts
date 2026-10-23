import { describe, expect, it } from "vitest";
import { environmentConfigs, loadProjectConfig } from "../config/load";
import { ConfigValidationError, validateInheritanceGraph } from "../config/schema";

const environments = ["local", "sai-local", "dev", "qa", "production"] as const;

describe("loadProjectConfig", () => {
  it("resolves all environments and inherits local values in sai-local", () => {
    for (const environment of environments) {
      const config = loadProjectConfig(environment);
      expect(config.environment).toBe(environment);
      expect(config.services.app.enabled).toBe(true);
      expect(config.services.worker.secrets).toEqual([]);
    }
    expect(loadProjectConfig("sai-local").storage.endpoint).toBe("http://127.0.0.1:9000");
    expect(loadProjectConfig("dev").storage).toMatchObject({ bucket: "callcaster-dev", region: "iad" });
    expect(loadProjectConfig("qa").storage).toMatchObject({ bucket: "callcaster-staging", region: "iad" });
    expect(loadProjectConfig("production").storage).toMatchObject({ bucket: "callcaster-production", region: "iad" });
  });

  it("preserves parent values while applying child overrides", () => {
    expect(environmentConfigs["sai-local"]).toEqual({ environment: "sai-local", parent: "local" });
    const config = loadProjectConfig("sai-local", {
      local: { environment: "local", storage: { endpoint: "https://storage.example.test", host: "storage.example.test" } },
      "sai-local": { environment: "sai-local", parent: "local", storage: { bucket: "sai" } },
    });
    expect(config.storage).toMatchObject({ endpoint: "https://storage.example.test", host: "storage.example.test", bucket: "sai" });
    expect(config.services.app).toEqual({ enabled: true, secrets: [] });
  });

  it("returns a deeply immutable resolved configuration", () => {
    const config = loadProjectConfig("local");
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.storage)).toBe(true);
    expect(() => {
      (config.storage as { bucket?: string }).bucket = "changed";
    }).toThrow(TypeError);
    expect(loadProjectConfig("local").storage.bucket).toBe("callcaster");
  });

  it("keeps overlays minimal and rejects strict or secret-bearing overlays", () => {
    expect(Object.keys(environmentConfigs["sai-local"])).toEqual(["environment", "parent"]);
    expect(() => loadProjectConfig("local", { local: { environment: "local", typo: true } })).toThrow(ConfigValidationError);
    const serialized = JSON.stringify(environmentConfigs);
    expect(serialized).not.toMatch(/(SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL)/i);
    expect(serialized).not.toContain("secretProvider");
  });

  it("rejects invalid inheritance graphs", () => {
    expect(() => validateInheritanceGraph({ local: { environment: "local", parent: "local" } })).toThrow(/itself/);
    expect(() =>
      validateInheritanceGraph({
        local: { environment: "local", parent: "dev" },
        dev: { environment: "dev", parent: "local" },
      }),
    ).toThrow(/circular/);
    expect(() => validateInheritanceGraph({ local: { environment: "local", parent: "qa" } })).toThrow(/not defined/);
    expect(() => validateInheritanceGraph({ local: { environment: "local", parent: "production" } })).toThrow(/production cannot/);
  });
});
