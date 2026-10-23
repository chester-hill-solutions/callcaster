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
      allowed: [
        "BETTER_AUTH_SECRET",
        "DATABASE_URL",
        "RESEND_API_KEY",
        "STRIPE_SECRET_KEY",
        "TWILIO_AUTH_TOKEN",
        "COHERE_API_KEY",
        "CRON_SECRET",
        "DATABASE_DIRECT_URL",
        "ELEVENLABS_API_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "TWILIO_API_KEY",
        "TWILIO_API_SECRET",
        "OPENAI_API_KEY",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "ACCESS_KEY_ID",
        "SECRET_ACCESS_KEY",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
      ],
      required: ["BETTER_AUTH_SECRET", "DATABASE_URL", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "TWILIO_AUTH_TOKEN"],
      optional: [
        "COHERE_API_KEY",
        "CRON_SECRET",
        "DATABASE_DIRECT_URL",
        "ELEVENLABS_API_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "TWILIO_API_KEY",
        "TWILIO_API_SECRET",
        "OPENAI_API_KEY",
      ],
      requiredAlternatives: [
        ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
        ["ACCESS_KEY_ID", "SECRET_ACCESS_KEY"],
        ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
      ],
    });
    expect(resolveSecretPlan("production", "media-stream").allowed).toEqual(["COHERE_API_KEY", "ELEVENLABS_API_KEY"]);
    expect(resolveSecretPlan("production", "worker").allowed).toEqual(
      expect.arrayContaining([
        "DATABASE_URL",
        "BETTER_AUTH_SECRET",
        "RESEND_API_KEY",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "ACCESS_KEY_ID",
        "SECRET_ACCESS_KEY",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "STRIPE_SECRET_KEY",
        "TWILIO_AUTH_TOKEN",
      ]),
    );
    expect(resolveSecretPlan("production", "sim")).toEqual({
      allowed: [],
      required: [],
      optional: [],
      requiredAlternatives: [],
    });
    expect(secretCatalog.OPENAI_API_KEY.services).toEqual(["app"]);
  });

  it("resolves the same conservative required/optional plan in each environment", () => {
    for (const environment of ["local", "dev", "qa", "production"] as const) {
      expect(resolveSecretPlan(environment, "app").required).toEqual([
        "BETTER_AUTH_SECRET",
        "DATABASE_URL",
        "RESEND_API_KEY",
        "STRIPE_SECRET_KEY",
        "TWILIO_AUTH_TOKEN",
      ]);
      expect(resolveSecretPlan(environment, "app").optional).toEqual([
        "COHERE_API_KEY",
        "CRON_SECRET",
        "DATABASE_DIRECT_URL",
        "ELEVENLABS_API_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "TWILIO_API_KEY",
        "TWILIO_API_SECRET",
        ...(environment === "production" ? ["OPENAI_API_KEY"] : []),
      ]);
    }
  });

  it("keeps object-storage credential aliases as alternative complete groups", () => {
    const worker = resolveSecretPlan("production", "worker");
    expect(worker.requiredAlternatives).toEqual([
      ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
      ["ACCESS_KEY_ID", "SECRET_ACCESS_KEY"],
      ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    ]);
    expect(worker.optional).not.toContain("S3_ACCESS_KEY_ID");
    expect(worker.optional).not.toContain("AWS_SECRET_ACCESS_KEY");
  });

  it("rejects undeclared names and cross-service requests without exposing values", () => {
    expect(() => validateSecretRequest({ environment: "production", service: "app", names: ["NOT_DECLARED"] })).toThrow(
      "Secret name is not declared",
    );
    expect(() => validateSecretRequest({ environment: "production", service: "worker", names: ["OPENAI_API_KEY"] })).toThrow(
      "not allowlisted for service 'worker'",
    );
    try {
      validateSecretRequest({ environment: "production", service: "app", names: ["sk_live_value"] });
      throw new Error("expected secret request to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretAccessPolicyError);
      expect(String(error)).not.toContain("sk_live_value");
    }
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
        services: { worker: { secrets: [{ name: "OPENAI_API_KEY" }] } },
      }),
    ).toThrow(/not allowlisted for service 'worker'/);
  });
});
