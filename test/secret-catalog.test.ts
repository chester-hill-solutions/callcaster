import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseProjectConfig } from "../config/schema";
import {
  resolveSecretPlan,
  secretCatalog,
  SecretAccessPolicyError,
  validateSecretRequest,
} from "../config/secrets";
import { secretNames } from "../config/secret-names";

const phaseZeroCatalog = JSON.parse(
  readFileSync(new URL("../scripts/configuration-inventory/catalog.json", import.meta.url), "utf8"),
) as { entries: Array<{ key: string; classification: string }> };

describe("typed secret catalog", () => {
  it("keeps the Phase 0 secret-name equality guard", () => {
    expect(secretNames).toEqual(
      phaseZeroCatalog.entries.filter((entry) => entry.classification === "secret").map((entry) => entry.key),
    );
  });

  it("exposes precise product-service allowlists", () => {
    expect(resolveSecretPlan("production", "app")).toEqual({
      allowed: ["DATABASE_URL", "CRON_SECRET", "DATABASE_DIRECT_URL", "STRIPE_SECRET_KEY"],
      required: ["DATABASE_URL"],
      optional: ["CRON_SECRET", "DATABASE_DIRECT_URL", "STRIPE_SECRET_KEY"],
    });
    expect(resolveSecretPlan("production", "media-stream").allowed).toEqual(["COHERE_API_KEY", "ELEVENLABS_API_KEY"]);
    expect(resolveSecretPlan("production", "worker")).toEqual({ allowed: [], required: [], optional: [] });
    expect(secretCatalog.OPENAI_API_KEY.services).toEqual([]);
  });

  it("resolves the same conservative required/optional plan in each environment", () => {
    for (const environment of ["local", "dev", "qa", "production"] as const) {
      expect(resolveSecretPlan(environment, "app").required).toEqual(["DATABASE_URL"]);
      expect(resolveSecretPlan(environment, "app").optional).toEqual([
        "CRON_SECRET",
        "DATABASE_DIRECT_URL",
        "STRIPE_SECRET_KEY",
      ]);
    }
  });

  it("rejects undeclared names and cross-service requests without exposing values", () => {
    expect(() => validateSecretRequest({ environment: "production", service: "app", names: ["NOT_DECLARED"] })).toThrow(
      "Secret name 'NOT_DECLARED' is not declared",
    );
    expect(() => validateSecretRequest({ environment: "production", service: "worker", names: ["DATABASE_URL"] })).toThrow(
      "not allowlisted for service 'worker'",
    );
    expect(() => validateSecretRequest({ environment: "production", service: "app", names: ["sk_live_value"] })).toThrow(
      SecretAccessPolicyError,
    );
    expect(() => validateSecretRequest({ environment: "production", service: "simulator" as "sim", names: [] })).toThrow(
      "Service 'simulator' is not allowlisted",
    );
    expect(validateSecretRequest({ environment: "production", service: "app", names: ["DATABASE_URL", "DATABASE_URL"] })).toEqual([
      "DATABASE_URL",
    ]);
    expect(JSON.stringify(secretCatalog)).not.toContain("sk_live_value");
    expect(JSON.stringify(secretCatalog)).not.toContain("value");
  });

  it("validates configured service references through ProjectConfig", () => {
    expect(() =>
      parseProjectConfig({
        environment: "production",
        services: { worker: { secrets: [{ name: "DATABASE_URL" }] } },
      }),
    ).toThrow(/not allowlisted for service 'worker'/);
  });
});
