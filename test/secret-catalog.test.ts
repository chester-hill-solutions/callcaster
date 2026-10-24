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
        "MEDIA_STREAM_SECRET",
        "COHERE_API_KEY",
        "CRON_SECRET",
        "DATABASE_DIRECT_URL",
        "ELEVENLABS_API_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "TWILIO_API_KEY",
        "TWILIO_API_SECRET",
        "TWILIO_EVENTS_SINK_SECRET",
        "OPENAI_API_KEY",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "ACCESS_KEY_ID",
        "SECRET_ACCESS_KEY",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
      ],
      required: [
        "BETTER_AUTH_SECRET",
        "DATABASE_URL",
        "RESEND_API_KEY",
        "STRIPE_SECRET_KEY",
        "TWILIO_AUTH_TOKEN",
        "MEDIA_STREAM_SECRET",
      ],
      optional: [
        "COHERE_API_KEY",
        "CRON_SECRET",
        "DATABASE_DIRECT_URL",
        "ELEVENLABS_API_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "TWILIO_API_KEY",
        "TWILIO_API_SECRET",
        "TWILIO_EVENTS_SINK_SECRET",
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
    for (const environment of ["local", "dev", "qa"] as const) {
      expect(resolveSecretPlan(environment, "sim").required).toEqual([
        "SIM_PERSON_A_PASSWORD",
        "SIM_PERSON_B_PASSWORD",
        "SIM_PERSON_C_PASSWORD",
      ]);
      expect(resolveSecretPlan(environment, "sim").allowed).toEqual([
        "SIM_PERSON_A_PASSWORD",
        "SIM_PERSON_B_PASSWORD",
        "SIM_PERSON_C_PASSWORD",
      ]);
    }
    for (const environment of ["local", "dev", "qa", "production"] as const) {
      for (const service of ["app", "worker", "media-stream"] as const) {
        const plan = resolveSecretPlan(environment, service);
        expect(plan.allowed).not.toEqual(expect.arrayContaining(["SIM_PERSON_A_PASSWORD", "SIM_PERSON_B_PASSWORD", "SIM_PERSON_C_PASSWORD"]));
        expect(plan.required).not.toEqual(expect.arrayContaining(["SIM_PERSON_A_PASSWORD", "SIM_PERSON_B_PASSWORD", "SIM_PERSON_C_PASSWORD"]));
      }
    }
    expect(secretCatalog.OPENAI_API_KEY.services).toEqual(["app"]);
    expect(secretCatalog.MEDIA_STREAM_SECRET.services).toEqual(["app"]);
    expect(secretCatalog.TWILIO_EVENTS_SINK_SECRET.services).toEqual(["app"]);
    expect(secretCatalog.SIM_PERSON_A_PASSWORD.services).toEqual(["sim"]);
  });

  it("resolves environment-specific application required and optional plans", () => {
    for (const environment of ["local", "dev", "qa", "production"] as const) {
      expect(resolveSecretPlan(environment, "app").required).toEqual([
        "BETTER_AUTH_SECRET",
        "DATABASE_URL",
        "RESEND_API_KEY",
        "STRIPE_SECRET_KEY",
        "TWILIO_AUTH_TOKEN",
        ...(environment === "production" ? ["MEDIA_STREAM_SECRET"] : []),
      ]);
      expect(resolveSecretPlan(environment, "app").optional).toEqual([
        "COHERE_API_KEY",
        "CRON_SECRET",
        "DATABASE_DIRECT_URL",
        "ELEVENLABS_API_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "TWILIO_API_KEY",
        "TWILIO_API_SECRET",
        "TWILIO_EVENTS_SINK_SECRET",
        ...(environment === "production" ? [] : ["MEDIA_STREAM_SECRET"]),
        ...(environment === "production" ? ["OPENAI_API_KEY"] : []),
      ]);
      expect(resolveSecretPlan(environment, "app").allowed).toContain("MEDIA_STREAM_SECRET");
      expect(resolveSecretPlan(environment, "app").allowed).toContain("TWILIO_EVENTS_SINK_SECRET");
      expect(resolveSecretPlan(environment, "media-stream").allowed).not.toContain("MEDIA_STREAM_SECRET");
      expect(resolveSecretPlan(environment, "media-stream").allowed).not.toContain("TWILIO_EVENTS_SINK_SECRET");
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
    expect(() => validateSecretRequest({ environment: "production", service: "app", names: ["SIM_PERSON_A_PASSWORD"] })).toThrow(
      "not allowlisted for service 'app'",
    );
    expect(() => validateSecretRequest({ environment: "production", service: "sim", names: ["SIM_PERSON_A_PASSWORD"] })).toThrow(
      "not allowlisted for service 'sim'",
    );
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
