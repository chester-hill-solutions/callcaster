import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DotenvSecretEmptyError,
  DotenvSecretFileError,
  DotenvSecretMissingError,
  DotenvSecretProvider,
} from "../config/dotenv-secret-provider";
import { SecretAccessPolicyError } from "../config/secrets";

const temporaryDirectories: string[] = [];

async function temporaryCwd(): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "callcaster-dotenv-provider-"));
  temporaryDirectories.push(cwd);
  return cwd;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("DotenvSecretProvider", () => {
  it("uses shell over .env.local over .env and does not mutate sources", async () => {
    const cwd = await temporaryCwd();
    const env = "DATABASE_URL=from-env\nIGNORED=value\n# preserve this comment\n";
    const local = "DATABASE_URL=from-local\n";
    await writeFile(path.join(cwd, ".env"), env);
    await writeFile(path.join(cwd, ".env.local"), local);
    const provider = new DotenvSecretProvider("local", "app", { cwd, shellEnv: { DATABASE_URL: "from-shell" } });

    await expect(provider.get("DATABASE_URL")).resolves.toBe("from-shell");
    expect(await readFile(path.join(cwd, ".env"), "utf8")).toBe(env);
    expect(await readFile(path.join(cwd, ".env.local"), "utf8")).toBe(local);
  });

  it("returns a value from each source when higher sources do not define it", async () => {
    const cwd = await temporaryCwd();
    await writeFile(path.join(cwd, ".env"), "RESEND_API_KEY=env-value\n");
    await writeFile(path.join(cwd, ".env.local"), "STRIPE_SECRET_KEY=local-value\n");
    const provider = new DotenvSecretProvider("local", "app", { cwd, shellEnv: { TWILIO_AUTH_TOKEN: "shell-value" } });

    await expect(provider.get("RESEND_API_KEY")).resolves.toBe("env-value");
    await expect(provider.get("STRIPE_SECRET_KEY")).resolves.toBe("local-value");
    await expect(provider.get("TWILIO_AUTH_TOKEN")).resolves.toBe("shell-value");
  });

  it("does not fall back when the highest-priority value is empty", async () => {
    const cwd = await temporaryCwd();
    await writeFile(path.join(cwd, ".env"), "DATABASE_URL=from-env\n");
    await writeFile(path.join(cwd, ".env.local"), "DATABASE_URL=\n");
    const provider = new DotenvSecretProvider("local", "app", { cwd, shellEnv: {} });

    await expect(provider.get("DATABASE_URL")).rejects.toBeInstanceOf(DotenvSecretEmptyError);
  });

  it("validates access before reading files", async () => {
    const provider = new DotenvSecretProvider("local", "worker", { cwd: "/path/that/must/not/be/read", shellEnv: {} });

    await expect(provider.get("OPENAI_API_KEY" as never)).rejects.toBeInstanceOf(SecretAccessPolicyError);
  });

  it("reports missing values without exposing values or file contents", async () => {
    const cwd = await temporaryCwd();
    await writeFile(path.join(cwd, ".env"), "UNRELATED_SECRET=do-not-report\n");
    const provider = new DotenvSecretProvider("local", "app", { cwd, shellEnv: {} });

    const error = await provider.get("DATABASE_URL").catch((caught) => caught);
    expect(error).toBeInstanceOf(DotenvSecretMissingError);
    expect(JSON.stringify(error)).not.toContain("do-not-report");
  });

  it("rejects malformed and unreadable selected files safely", async () => {
    const cwd = await temporaryCwd();
    await writeFile(path.join(cwd, ".env"), "this is not dotenv\n");
    const provider = new DotenvSecretProvider("local", "app", { cwd, shellEnv: {} });
    await expect(provider.get("DATABASE_URL")).rejects.toMatchObject({ kind: "malformed", fileName: ".env" });

    await writeFile(path.join(cwd, ".env"), "DATABASE_URL=ok\n");
    await writeFile(path.join(cwd, ".env.local"), "not dotenv\n");
    await expect(provider.get("DATABASE_URL")).rejects.toMatchObject({ kind: "malformed", fileName: ".env.local" });

    await rm(path.join(cwd, ".env.local"));
    await mkdir(path.join(cwd, ".env.local"));
    await expect(provider.get("DATABASE_URL")).rejects.toMatchObject({ kind: "unreadable", fileName: ".env.local" });
  });

  it("reports empty and missing values without serializing secret data", async () => {
    const cwd = await temporaryCwd();
    await writeFile(path.join(cwd, ".env"), "DATABASE_URL=\n");
    const provider = new DotenvSecretProvider("local", "app", { cwd, shellEnv: {} });
    const error = await provider.get("DATABASE_URL").catch((caught) => caught);
    expect(error).toBeInstanceOf(DotenvSecretEmptyError);
    expect(JSON.stringify(error)).not.toContain("DATABASE_URL=");
    expect(JSON.stringify(error)).not.toContain(cwd);
  });
});
