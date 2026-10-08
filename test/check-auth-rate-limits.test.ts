import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

/**
 * Self-test for `scripts/check-auth-rate-limits.mjs` (#2220).
 *
 * A gate nobody tests is a gate that silently stops gating. Every case here
 * plants a violation in a fixture tree and asserts the script FAILS, because a
 * test that only ever sees the passing path cannot tell a working gate from a
 * script that always exits 0.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "check-auth-rate-limits.mjs");

let fixtureDir: string;

function writeRoute(name: string, src: string) {
  const file = path.join(fixtureDir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, src);
}

function runGate() {
  try {
    const stdout = execFileSync("node", [SCRIPT, "--routes-dir", fixtureDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: stdout };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const LIMITED_ROUTE = `
import { rateLimitedPostAuth } from "@/lib/platform-auth-rate-limit.server";
export const action = { auth: rateLimitedPostAuth("auth:sign-in") };
`;

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-rate-limit-gate-"));
});

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe("check-auth-rate-limits", () => {
  test("fails on a route that signs in with no rate limit", () => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureDir, { recursive: true });
    // A real call site, not a bare reference — signals are call sites so the
    // gate stays quiet on modules that merely hold a function reference.
    writeRoute(
      "signin.action.server.ts",
      `import { loginWithPassword } from "@/lib/platform-auth.server";\nexport const action = { handler: (r: Request) => loginWithPassword(r, "e", "p") };\n`,
    );

    const result = runGate();
    expect(result.code).toBe(1);
    expect(result.out).toContain("signin.action.server.ts");
    expect(result.out).toContain("no rate limit");
  });

  // The detection has to work off call sites, not filenames — a brand-new
  // route nobody has ever seen must still be caught.
  test("fails on a brand-new auth action it has never seen", () => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureDir, { recursive: true });
    writeRoute(
      "api+/auth/magic-link.action.server.ts",
      `import { auth } from "@/server/auth-instance";\nexport const action = { handler: () => auth.api.signInEmail({ body: {} }) };\n`,
    );

    const result = runGate();
    expect(result.code).toBe(1);
    expect(result.out).toContain("magic-link.action.server.ts");
  });

  test("passes once the route declares a rate-limited scope", () => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureDir, { recursive: true });
    writeRoute(
      "signin.action.server.ts",
      `import { loginWithPassword } from "@/lib/platform-auth.server";\nexport const action = { handler: loginWithPassword };\n`,
    );
    writeRoute("limited.action.server.ts", LIMITED_ROUTE);

    const result = runGate();
    expect(result.code).toBe(0);
    expect(result.out).toContain("0 unprotected");
  });

  // A scope name that no longer exists in the LIMITS table would silently
  // allow everything, so it has to fail rather than pass quietly.
  test("fails on a scope name the limiter module does not define", () => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureDir, { recursive: true });
    writeRoute(
      "typo.action.server.ts",
      `import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";\n` +
        `import { loginWithPassword } from "@/lib/platform-auth.server";\n` +
        `export const action = { handler: async (r: Request) => {\n` +
        `  const scope = "auth:sign-in-typo";\n` +
        `  const limited = await enforceAuthRateLimit(r, scope);\n` +
        `  if (limited) return limited;\n` +
        `  return loginWithPassword(r, "e", "p");\n` +
        `} };\n`,
    );

    const result = runGate();
    expect(result.code).toBe(1);
    expect(result.out).toContain("auth:sign-in-typo");
  });

  // Routes that cannot be brute-forced at this boundary must not be forced
  // into a pointless DB round-trip, but the exemption has to be deliberate.
  test("passes a surface carrying a reasoned exemption", () => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureDir, { recursive: true });
    // Same path as the real exemption, so the exemption applies on merit.
    writeRoute(
      "auth/confirm.loader.server.ts",
      `import { auth } from "@/server/auth-instance";\nexport const loader = { handler: () => auth.api.verifyEmail({ query: {} }) };\n`,
    );

    const result = runGate();
    expect(result.code).toBe(0);
    expect(result.out).toContain("1 carry a reasoned exemption");
  });

  // An exemption is path-keyed, not method-keyed: the same call at a
  // different path must still fail, or the exemption becomes a blanket.
  test("fails the same call at a path with no exemption", () => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureDir, { recursive: true });
    writeRoute(
      "auth/somewhere-else.loader.server.ts",
      `import { auth } from "@/server/auth-instance";\nexport const loader = { handler: () => auth.api.verifyEmail({ query: {} }) };\n`,
    );

    const result = runGate();
    expect(result.code).toBe(1);
    expect(result.out).toContain("somewhere-else.loader.server.ts");
  });

  // The live assertion: the real route tree is currently clean. If a future
  // change adds an unthrottled auth action, this fails as well as the gate.
  test("the real route tree has no unprotected auth surface", () => {
    const stdout = execFileSync("node", [SCRIPT], { encoding: "utf8" });
    expect(stdout).toContain("0 unprotected");
  });
});
