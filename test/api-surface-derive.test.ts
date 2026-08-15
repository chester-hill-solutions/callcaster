/**
 * D4 (issue #1242) — the derivation behind the generated API surface core.
 *
 * The value of generating the inventory rests entirely on the derivation being
 * conservative: it must refuse to guess. These cases pin the refusals as
 * tightly as the successes, because a generator that confidently invents an
 * auth class is worse than the hand-maintained literal it replaced.
 */
import { describe, expect, test } from "vitest";
// Plain .mjs gate helper — tsconfig excludes *.test.ts, so no shim is needed.
import {
  classifyHandlerAuth,
  deriveMethods,
  shimHandlerExports,
} from "../scripts/lib/api-surface-derive.mjs";

const classify = (src: string, name = "loader") =>
  classifyHandlerAuth(src, name) as {
    authClass: string | null;
    allows: string[] | null;
    via: string;
    rateLimited: boolean;
  };

describe("shim handler exports", () => {
  test("reads a re-export list", () => {
    expect(
      shimHandlerExports(`export { loader, action } from "../thing.action.server";\n`),
    ).toEqual(["action", "loader"]);
  });

  test("reads separate re-export lines", () => {
    expect(
      shimHandlerExports(
        `export { loader } from "./a.loader.server";\nexport { action } from "./a.action.server";\n`,
      ),
    ).toEqual(["action", "loader"]);
  });

  test("ignores non-handler exports", () => {
    expect(
      shimHandlerExports(
        `export { middleware } from "./x.middleware.server";\nexport default function Layout() {}\n`,
      ),
    ).toEqual([]);
  });

  test("counts a locally defined handler", () => {
    expect(shimHandlerExports(`export const loader = defineLoader({});\n`)).toEqual([
      "loader",
    ]);
  });
});

describe("method derivation", () => {
  test("a loader is GET, whatever its body says", () => {
    expect(deriveMethods(`export const loader = defineLoader({});`, "loader")).toEqual([
      "GET",
    ]);
  });

  test("an action with no method branch is POST", () => {
    expect(deriveMethods(`export const action = defineAction({});`, "action")).toEqual([
      "POST",
    ]);
  });

  /**
   * An action that branches on methods is taken at its word: the branches ARE
   * the surface. That holds because these handlers terminate in a 405 rather
   * than falling through — an action that branches on PATCH/DELETE and then
   * quietly POSTs would be under-reported here, and no route in the tree does
   * that (verified against all 173 handlers during the D4 migration).
   */
  test("method branches are collected, in canonical order", () => {
    const src = `
      export const action = defineAction({ handler: async ({ request }) => {
        if (request.method === "POST") return create();
        if (request.method === "PATCH") return patch();
        if (request.method === "DELETE") return del();
        return jsonError("Method not allowed", 405);
      }});`;
    expect(deriveMethods(src, "action")).toEqual(["POST", "PATCH", "DELETE"]);
  });

  test("single-quoted literals and switch cases count too", () => {
    const src = `
      export const action = defineAction({ handler: async ({ request }) => {
        const method = request.method;
        switch (method) {
          case 'POST': return a();
          case 'PATCH': return b();
        }
      }});`;
    expect(deriveMethods(src, "action")).toEqual(["POST", "PATCH"]);
  });

  test("a GET guard inside an action does not make it a GET surface", () => {
    const src = `
      export const action = defineAction({ handler: async ({ request }) => {
        if (request.method === "GET") return jsonError("Method not allowed", 405);
        return post();
      }});`;
    expect(deriveMethods(src, "action")).toEqual(["POST"]);
  });
});

describe("auth: authoritative strategies fix the class", () => {
  test("a Twilio signature strategy is twilioSignature", () => {
    const src = `export const action = defineAction({
      auth: async ({ request }) => {
        const forbidden = await requireTwilioSignature(request);
        if (forbidden) return forbidden;
        return {};
      },
    });`;
    expect(classify(src, "action")).toMatchObject({
      authClass: "twilioSignature",
      allows: null,
    });
  });

  test("the min-role argument decides between session and workspaceAdmin", () => {
    const admin = `export const loader = defineLoader({ auth: dataPlaneSessionMinRoleAuth(MemberRole.Admin), });`;
    const caller = `export const loader = defineLoader({ auth: dataPlaneSessionMinRoleAuth(MemberRole.Caller), });`;
    expect(classify(admin).authClass).toBe("workspaceAdmin");
    // Caller is the lowest rank — the floor is a no-op and the gate is membership.
    expect(classify(caller).authClass).toBe("session");
  });

  test("a capability strategy bound to a module-scope const still resolves", () => {
    const src = `
      const sessionMemberAuth = dataPlaneSessionMinRoleAuth(MemberRole.Admin);
      export const loader = defineLoader({ auth: sessionMemberAuth, });`;
    expect(classify(src).authClass).toBe("workspaceAdmin");
  });

  test("defineDataPlaneListLoader is itself the strategy", () => {
    const src = `export const loader = defineDataPlaneListLoader({ capability: "campaigns.read", key: "x", list: async () => ({}) });`;
    expect(classify(src)).toMatchObject({ authClass: "apiKeyOrSession" });
  });
});

describe("auth: base helpers bound the class without fixing it", () => {
  test("requireJsonAuth permits session or a deeper admin gate", () => {
    const src = `export const loader = defineLoader({ auth: ({ request }) => requireJsonAuth(request), });`;
    expect(classify(src)).toMatchObject({
      authClass: null,
      allows: ["session", "workspaceAdmin"],
    });
  });

  test("requireDualAuth permits an API key until the route rejects one", () => {
    const src = `export const action = defineAction({ auth: ({ request }) => requireDualAuth(request), });`;
    expect(classify(src, "action").allows).toContain("apiKeyOrSession");
  });

  test("a getDualAuthUser null-rejection narrows dual auth to session", () => {
    const src = `export const action = defineAction({
      auth: async ({ request }) => {
        const auth = await requireDualAuth(request);
        const user = getDualAuthUser(auth);
        if (!user) return new Response("Unauthorized", { status: 401 });
        return { user };
      },
    });`;
    expect(classify(src, "action").allows).toEqual(["session", "workspaceAdmin"]);
  });

  test("...unless an api_key branch admits keys first", () => {
    const src = `export const action = defineAction({
      auth: async ({ request }) => {
        const auth = await requireDualAuth(request);
        if (auth.authType === "api_key") return { auth };
        const user = getDualAuthUser(auth);
        if (!user) return new Response("Unauthorized", { status: 401 });
        return { user };
      },
    });`;
    expect(classify(src, "action").allows).toContain("apiKeyOrSession");
  });
});

describe("auth: the refusals", () => {
  test("a handler with no auth strategy is unresolved, not public", () => {
    const src = `export const action = defineAction({ sideEffects: ["db-write"], handler: async () => ok(), });`;
    expect(classify(src, "action")).toMatchObject({
      authClass: null,
      allows: null,
      via: "no-auth-strategy",
    });
  });

  test("an unrecognised preamble is unresolved", () => {
    const src = `export const loader = defineLoader({ auth: ({ context }) => somethingBespoke(context), });`;
    expect(classify(src)).toMatchObject({ authClass: null, allows: null });
  });

  test("rateLimitedPostAuth alone is a public surface", () => {
    const src = `export const action = defineAction({ auth: rateLimitedPostAuth("auth:register"), });`;
    expect(classify(src, "action")).toMatchObject({
      authClass: "publicForm",
      rateLimited: true,
    });
  });

  test("rateLimitedPostAuth with a ?? fallthrough is a modifier, not the class", () => {
    // The limiter resolves to undefined on the happy path, so the right-hand
    // side runs and a session is genuinely required.
    const src = `export const action = defineAction({
      auth: async (args) =>
        (await rateLimitedPostAuth("auth:reset-password")(args)) ??
        requireJsonAuth(args.request),
    });`;
    const result = classify(src, "action");
    expect(result.authClass).not.toBe("publicForm");
    expect(result.allows).toEqual(["session", "workspaceAdmin"]);
    expect(result.rateLimited).toBe(true);
  });
});
