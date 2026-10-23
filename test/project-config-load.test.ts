import { describe, expect, it } from "vitest";
import { environmentConfigs, loadProjectConfig, resolveLocalProjectConfig } from "../config/load";
import { ConfigValidationError, validateInheritanceGraph } from "../config/schema";

const environments = ["local", "dev", "qa", "production"] as const;

describe("loadProjectConfig", () => {
  it("resolves all static environments", () => {
    for (const environment of environments) {
      const config = loadProjectConfig(environment);
      expect(config.environment).toBe(environment);
      expect(config.services.app.enabled).toBe(true);
      expect(config.services.worker.secrets).toEqual([]);
    }
    expect(loadProjectConfig("local").storage.endpoint).toBe("http://127.0.0.1:9000");
    expect(loadProjectConfig("dev").storage).toMatchObject({ bucket: "callcaster-dev", region: "iad" });
    expect(loadProjectConfig("qa").storage).toMatchObject({ bucket: "callcaster-staging", region: "iad" });
    expect(loadProjectConfig("production").storage).toMatchObject({ bucket: "callcaster-production", region: "iad" });
  });

  it("applies validated overlay values", () => {
    const config = loadProjectConfig("local", {
      local: { environment: "local", storage: { endpoint: "https://storage.example.test", host: "storage.example.test" } },
    });
    expect(config.storage).toMatchObject({ endpoint: "https://storage.example.test", host: "storage.example.test" });
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
    expect(Object.keys(environmentConfigs.local)).toEqual(["environment", "urls", "storage"]);
    expect(() => loadProjectConfig("local", { local: { environment: "local", typo: true } })).toThrow(ConfigValidationError);
    const serialized = JSON.stringify(environmentConfigs);
    expect(serialized).not.toMatch(/(SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL)/i);
    expect(serialized).not.toContain("secretProvider");
  });

  it("resolves independent local profiles and identity metadata", () => {
    const sai = resolveLocalProjectConfig({ devName: "sai", envName: "local" });
    const other = resolveLocalProjectConfig({ devName: "alex", envName: "local" });
    expect(sai.identity).toEqual({
      devName: "sai",
      envName: "local",
      profileName: "sai-local",
      hostname: "sai-local.callcaster.ca",
      publicUrl: "https://sai-local.callcaster.ca",
    });
    expect(other.identity.publicUrl).toBe("https://alex-local.callcaster.ca");
    expect(sai.config.urls.publicApp).toBe("https://sai-local.callcaster.ca");
    expect(other.config.urls.publicApp).toBe("https://alex-local.callcaster.ca");
    expect(Object.isFrozen(sai.config)).toBe(true);
  });

  it("validates local profile names and supports explicit public URLs", () => {
    expect(() => resolveLocalProjectConfig({ devName: "Sai Local", envName: "local" })).toThrow();
    expect(() => resolveLocalProjectConfig({ devName: "sai", envName: "dev" as "local" })).toThrow();
    const resolved = resolveLocalProjectConfig({ devName: "sai", envName: "local", publicUrl: "https://tunnel.example.test/path" });
    expect(resolved.identity.hostname).toBe("tunnel.example.test");
    expect(resolved.config.urls.publicApp).toBe("https://tunnel.example.test/path");
    expect(resolveLocalProjectConfig({ devName: "sai", envName: "local", publicUrl: "http://localhost:3000/path" }).identity.publicUrl).toBe(
      "http://localhost:3000/path",
    );
    for (const publicUrl of [
      "https://user:token@example.test/path",
      "https://example.test/path?api_key=secret",
      "https://example.test/path#frag",
      "http://example.test/path",
    ]) {
      expect(() => resolveLocalProjectConfig({ devName: "sai", envName: "local", publicUrl })).toThrow();
    }
  });

  it("reports malformed local profile URLs as configuration errors", () => {
    expect(() => resolveLocalProjectConfig({ devName: "sai", envName: "local", publicUrl: "not-a-url" })).toThrow(
      ConfigValidationError,
    );
  });

  it("rejects local profiles whose derived DNS label exceeds 63 characters", () => {
    const safeDevName = "a".repeat(57);
    const safe = resolveLocalProjectConfig({ devName: safeDevName, envName: "local" });
    expect(safe.identity.profileName).toHaveLength(63);

    expect(() =>
      resolveLocalProjectConfig({
        devName: "a".repeat(58),
        envName: "local",
        publicUrl: "https://tunnel.example.test",
      }),
    ).toThrow(/63-character DNS label limit/);
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
