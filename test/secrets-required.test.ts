import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planRequiredSecrets } from "../config/secrets-required";

const script = resolve("scripts/secrets-required.ts");

function run(...args: string[]) {
  return spawnSync("npx", ["--no-install", "tsx", script, ...args], {
    cwd: resolve("."),
    encoding: "utf8",
  });
}

describe("secrets:required", () => {
  it("returns a stable JSON plan with independent names and alternative groups", () => {
    const result = run("--environment", "production", "--service", "worker", "--provider", "password-manager");
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      environment: "production",
      service: "worker",
      provider: "password-manager",
      required: ["BETTER_AUTH_SECRET", "DATABASE_URL", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "TWILIO_AUTH_TOKEN"],
      optional: ["STRIPE_WEBHOOK_SECRET"],
      requiredAlternatives: [
        ["ACCESS_KEY_ID", "SECRET_ACCESS_KEY"],
        ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
        ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
      ],
    });
  });

  it("uses the schema default provider", () => {
    expect(JSON.parse(run("--environment", "local", "--service", "sim").stdout).provider).toBe("dotenv");
    expect(JSON.parse(run("--environment", "qa", "--service", "sim").stdout).provider).toBe("railway");
  });

  it("proves local dotenv and password-manager plans are identical", () => {
    for (const service of ["app", "worker", "media-stream", "sim"] as const) {
      const dotenv = planRequiredSecrets({ environment: "local", service, provider: "dotenv" });
      const passwordManager = planRequiredSecrets({ environment: "local", service, provider: "password-manager" });
      expect({ ...dotenv, provider: undefined }).toEqual({ ...passwordManager, provider: undefined });
    }
  });

  it.each([
    [["--environment", "local", "--service", "app", "--provider", "railway"], "not valid for local"],
    [["--environment", "local", "--service", "app", "--provider", "github"], "CI-only"],
    [["--environment", "local", "--service", "app", "--service", "worker"], "duplicate flag"],
    [["--environment", "local", "--service", "app", "extra"], "positional arguments"],
    [["--environment", "local", "--service", "app", "--nope", "x"], "unknown or duplicate flag"],
  ])("rejects invalid arguments without stdout", (args, message) => {
    const result = run(...args);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(message);
    expect(result.stderr).toContain("usage: npm run secrets:required");
  });

  it("does not echo supplied secret-shaped values", () => {
    const value = "sk_live_secret_value";
    const result = run("--environment", value, "--service", "app");
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(value);
  });
});
