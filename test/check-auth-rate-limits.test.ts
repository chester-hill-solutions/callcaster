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

  test.each([
    ["tokenLogin", ""],
    ["tokenLogin", 'auth: rateLimitedPostAuth("auth:catch-all"),'],
    ["loginWithPassword", 'auth: rateLimitedPostAuth("auth:catch-all"),'],
  ])(
    "rejects %s with missing or wrong operation scope (%s)",
    (helper, auth) => {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
      fs.mkdirSync(fixtureDir, { recursive: true });
      writeRoute(
        "credential.action.server.ts",
        `
      import { ${helper} } from "@/lib/platform-auth.server";
      export const action = { ${auth} handler: (r: Request) => ${helper}(r, {}) };
    `,
      );
      const result = runGate();
      expect(result.code).toBe(1);
      expect(result.out).toContain(helper);
    },
  );

  test("checks token login when its import has a local alias", () => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureDir, { recursive: true });
    writeRoute(
      "aliased.action.server.ts",
      `
      import { tokenLogin as login } from "@/lib/platform-auth.server";
      export const action = { auth: rateLimitedPostAuth("auth:catch-all"), handler: (r: Request) => login(r, {}) };
    `,
    );
    expect(runGate().code).toBe(1);
  });

  test.each([
    ["auth:sign-in", 0],
    ["auth:catch-all", 1],
  ])("checks the typed Better Auth API alias with scope %s", (scope, code) => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureDir, { recursive: true });
    writeRoute(
      "two-factor.action.server.ts",
      `
        import { auth } from "@/server/auth-instance";
        const authApi = auth.api as typeof auth.api & { verifyTOTP: Function };
        export const action = { auth: rateLimitedPostAuth("${scope}"), handler: () => authApi.verifyTOTP({}) };
      `,
    );
    expect(runGate().code).toBe(code);
  });

  test.each([
    ["2fa:verify", 0],
    ["2fa:enable", 1],
  ])(
    "checks the user-scoped 2FA setup limiter with scope %s",
    (scope, code) => {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
      fs.mkdirSync(fixtureDir, { recursive: true });
      writeRoute(
        "account.security.loader.server.ts",
        `
        import { auth } from "@/server/auth-instance";
        const authApi = auth.api as typeof auth.api & { verifyTOTP: Function };
        export const action = { handler: async (r: Request) => {
          await enforceTwoFactorSetupRateLimit("fixture-user", "${scope}");
          return authApi.verifyTOTP({});
        }};
      `,
      );
      expect(runGate().code).toBe(code);
    },
  );

  test("a comment cannot supply a missing limiter or strict scope", () => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureDir, { recursive: true });
    writeRoute(
      "decoy.action.server.ts",
      `
      // rateLimitedPostAuth("auth:sign-in")
      export const action = { handler: (r: Request) => loginWithPassword(r, "e", "p") };
    `,
    );
    expect(runGate().code).toBe(1);
  });

  test.each([
    ['"sign-up": "auth:register"', '"sign-up": "auth:catch-all"', "sign-up"],
    [
      '"request-password-reset": "auth:forgot-password"',
      '"request-password-reset": "auth:catch-all"',
      "request-password-reset",
    ],
    [
      'AUTH_OPERATION_SCOPES[operation] ?? "auth:sign-in"',
      'AUTH_OPERATION_SCOPES[operation] ?? "auth:catch-all"',
      "strict default",
    ],
    [
      '"/api/auth/sign-out",',
      '"/api/auth/new-credential-plugin",',
      "session lifecycle",
    ],
    [
      '"sign-in": "auth:sign-in",',
      '"new-credential-plugin": "auth:catch-all", "sign-in": "auth:sign-in",',
      "strict credential scope",
    ],
    ["rateLimitScopeForAuthPath(url),", '"auth:catch-all",', "scope policy"],
  ])("rejects a catch-all policy mutation: %s", (before, after, diagnostic) => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureDir, { recursive: true });
    const source = fs.readFileSync(
      path.join(ROOT, "app/routes/api+/auth/$.loader.server.ts"),
      "utf8",
    );
    expect(source.split(before)).toHaveLength(2);
    writeRoute("api+/auth/$.loader.server.ts", source.replace(before, after));
    const result = runGate();
    expect(result.code).toBe(1);
    expect(result.out).toContain(diagnostic);
  });

  // The live assertion: the real route tree is currently clean. If a future
  // change adds an unthrottled auth action, this fails as well as the gate.
  test("the real route tree has no unprotected auth surface", () => {
    const stdout = execFileSync("node", [SCRIPT], { encoding: "utf8" });
    expect(stdout).toContain("0 unprotected");
  });
});
