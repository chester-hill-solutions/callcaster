import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRuntimeEnvironment, runtimeEnvironmentToLocalProfile } from "../config/runtime-environment";

async function tempCwd(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "callcaster-runtime-environment-"));
}

describe("runtime environment snapshot", () => {
  it("uses .env.local over .env and shell values over both", async () => {
    const cwd = await tempCwd();
    await writeFile(path.join(cwd, ".env"), "DEV_NAME=from-env\nENV=local\nBASE_URL=https://env.example.test\n");
    await writeFile(path.join(cwd, ".env.local"), "DEV_NAME=from-local\nBASE_URL=https://local.example.test\n");

    await expect(readRuntimeEnvironment({ cwd, shellEnv: { DEV_NAME: "from-shell", ENV: undefined } })).resolves.toMatchObject({
      DEV_NAME: "from-shell",
      ENV: "local",
      BASE_URL: "https://local.example.test",
    });
  });

  it("supports absent dotenv files", async () => {
    await expect(readRuntimeEnvironment({ cwd: await tempCwd(), shellEnv: { ENV: "local" } })).resolves.toEqual({ ENV: "local" });
  });

  it("returns an immutable allowlisted snapshot without mutating process.env", async () => {
    const before = { ...process.env };
    const snapshot = await readRuntimeEnvironment({ cwd: await tempCwd(), shellEnv: { DEV_NAME: "sai", ENV: "local", DATABASE_URL: "secret" } });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).toEqual({ DEV_NAME: "sai", ENV: "local" });
    expect(() => ((snapshot as Record<string, string>).DEV_NAME = "changed")).toThrow(TypeError);
    expect({ ...process.env }).toEqual(before);
  });

  it("extracts a safe local profile", () => {
    expect(runtimeEnvironmentToLocalProfile({ DEV_NAME: "sai", ENV: "local", BASE_URL: "https://tunnel.example.test/path" })).toEqual({
      devName: "sai",
      envName: "local",
      publicUrl: "https://tunnel.example.test/path",
    });
  });

  it("rejects missing or invalid profile names without leaking values", () => {
    expect(() => runtimeEnvironmentToLocalProfile({ ENV: "local" })).toThrow("DEV_NAME and ENV are required");
    expect(() => runtimeEnvironmentToLocalProfile({ DEV_NAME: "Sai Local", ENV: "local" })).toThrow("invalid");
    expect(() => runtimeEnvironmentToLocalProfile({ DEV_NAME: "sai", ENV: "dev" })).toThrow("invalid");
    expect(() => runtimeEnvironmentToLocalProfile({ DEV_NAME: "sai", ENV: "local", BASE_URL: "not-a-url" })).toThrow("invalid");
  });

  it("does not require real dotenv files when cwd is injected", async () => {
    const snapshot = await readRuntimeEnvironment({ cwd: await tempCwd(), shellEnv: { NODE_ENV: "test" } });
    expect(snapshot).toEqual({ NODE_ENV: "test" });
  });
});
