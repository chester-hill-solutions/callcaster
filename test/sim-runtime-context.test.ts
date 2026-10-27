import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectConfig } from "../config/load";
import type { SecretProvider } from "../config/secret-provider";
import { createSimRuntimeContext, SimRuntimeContextError } from "../e2e/sim/runtime-context";

const temporaryDirectories: string[] = [];

async function fixtureDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "callcaster-sim-context-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const localRuntime = (devName: string) => Object.freeze({ DEV_NAME: devName, ENV: "local" });

describe("createSimRuntimeContext", () => {
  it("derives distinct local identities from the shared runtime snapshot", async () => {
    const sai = await createSimRuntimeContext({ personaKey: "person-a", runtimeEnvironment: localRuntime("sai") });
    const alex = await createSimRuntimeContext({ personaKey: "person-a", runtimeEnvironment: localRuntime("alex") });

    expect(sai.profile.runtimeIdentity).toBe("sai-local");
    expect(alex.profile.runtimeIdentity).toBe("alex-local");
    expect(sai.profile.email).not.toBe(alex.profile.email);
    expect(sai.providerName).toBe("dotenv");
  });

  it("uses the existing dotenv provider precedence without mutating fixtures", async () => {
    const cwd = await fixtureDirectory();
    const originalProcessValue = process.env.SIM_PERSON_A_PASSWORD;
    const env = "SIM_PERSON_A_PASSWORD=from-env\n";
    const local = "SIM_PERSON_A_PASSWORD=from-local\n";
    await writeFile(path.join(cwd, ".env"), env);
    await writeFile(path.join(cwd, ".env.local"), local);
    const before = await Promise.all([readFile(path.join(cwd, ".env"), "utf8"), readFile(path.join(cwd, ".env.local"), "utf8")]);
    const context = await createSimRuntimeContext({
      personaKey: "person-a",
      runtimeEnvironment: localRuntime("alex"),
      dotenv: { cwd, shellEnv: { SIM_PERSON_A_PASSWORD: "from-shell" } },
    });

    await expect(context.getCredential()).resolves.toBe("from-shell");
    expect(await Promise.all([readFile(path.join(cwd, ".env"), "utf8"), readFile(path.join(cwd, ".env.local"), "utf8")])).toEqual(before);
    expect(process.env.SIM_PERSON_A_PASSWORD).toBe(originalProcessValue);
  });

  it("requests only the profile credential and denies cross-name access", async () => {
    const requests: string[] = [];
    const provider: SecretProvider = {
      name: "dotenv",
      environment: "local",
      service: "sim",
      get: async (name) => {
        requests.push(name);
        return "secret-value";
      },
    };
    const context = await createSimRuntimeContext({
      personaKey: "person-b",
      runtimeEnvironment: localRuntime("alex"),
      secretProviderFactory: () => provider,
    });

    await expect(context.getCredential()).resolves.toBe("secret-value");
    await expect(context.getCredential("SIM_PERSON_A_PASSWORD")).rejects.toThrow(/not allowed/);
    await expect(context.getCredential("DATABASE_URL")).rejects.toThrow(/not allowed/);
    const rejectedValue = "secret-value-that-must-not-appear";
    const error = await context.getCredential(rejectedValue).catch((caught) => caught);
    expect(String(error)).not.toContain(rejectedValue);
    expect(requests).toEqual(["SIM_PERSON_B_PASSWORD"]);
  });

  it("redacts provider errors and does not serialize a secret", async () => {
    const context = await createSimRuntimeContext({
      personaKey: "person-a",
      runtimeEnvironment: localRuntime("alex"),
      secretProviderFactory: () => ({
        name: "dotenv",
        environment: "local",
        service: "sim",
        get: async () => { throw new Error("secret-value /tmp/private/.env"); },
      }),
    });

    const error = await context.getCredential().catch((caught) => caught);
    expect(error).toBeInstanceOf(SimRuntimeContextError);
    expect(String(error)).toContain("SIM_PERSON_A_PASSWORD");
    expect(String(error)).toContain("dotenv");
    expect(String(error)).not.toContain("secret-value");
    expect(String(error)).not.toContain(".env");
    expect(JSON.stringify(context)).not.toContain("secret-value");
  });

  it("refuses production before the provider factory is called", async () => {
    let constructed = false;
    await expect(createSimRuntimeContext({
      personaKey: "person-a",
      environment: "production",
      secretProviderFactory: () => {
        constructed = true;
        throw new Error("must not construct");
      },
    })).rejects.toThrow("SIM runtime context is not allowed for production");
    expect(constructed).toBe(false);
  });

  it("keeps typed dev and qa provider selection at the boundary", async () => {
    const providers: string[] = [];
    const factory = ({ providerName }: { providerName: "railway" | "password-manager" | "dotenv" | "github" }) => {
      providers.push(providerName);
      return {
        name: providerName,
        environment: "dev" as const,
        service: "sim" as const,
        get: async () => "safe-value",
      };
    };

    await createSimRuntimeContext({ personaKey: "person-a", environment: "dev", secretProviderFactory: factory });
    await createSimRuntimeContext({ personaKey: "person-a", environment: "qa", secretProviderFactory: factory });
    expect(providers).toEqual(["railway", "railway"]);
    expect(loadProjectConfig("dev").secretProvider).toBe("railway");
    expect(loadProjectConfig("qa").secretProvider).toBe("railway");
  });

  it("does not require local dotenv inputs for hosted or production environments", async () => {
    const factory = () => ({
      name: "railway" as const,
      environment: "dev" as const,
      service: "sim" as const,
      get: async () => "safe-value",
    });

    await expect(createSimRuntimeContext({ personaKey: "person-a", environment: "dev", secretProviderFactory: factory })).resolves.toBeDefined();
    await expect(createSimRuntimeContext({ personaKey: "person-a", environment: "qa", secretProviderFactory: factory })).resolves.toBeDefined();
    await expect(createSimRuntimeContext({ personaKey: "person-a", environment: "production", secretProviderFactory: factory })).rejects.toThrow(
      "SIM runtime context is not allowed for production",
    );
  });

  it("freezes the context and profile", async () => {
    const context = await createSimRuntimeContext({ personaKey: "person-a", runtimeEnvironment: localRuntime("alex") });
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.profile)).toBe(true);
    expect(Object.getOwnPropertyNames(context)).toEqual(["profile", "providerName", "getCredential"]);
    expect(JSON.stringify(context)).toContain("SIM_PERSON_A_PASSWORD");
    expect(JSON.stringify(context)).not.toContain("secret-value");
  });
});
