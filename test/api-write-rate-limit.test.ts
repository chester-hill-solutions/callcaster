import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";
import {
  API_WRITE_LIMITS,
  apiRateLimitKey,
  apiRateLimitPrincipal,
  checkApiWriteRateLimit,
} from "@/lib/api-write-rate-limit.server";

/**
 * #2135 — the public write API has no per-key bucket.
 *
 * `platform-rate-limit.server` is NOT mocked here. It falls back to an
 * in-memory Map under VITEST, so these tests exercise the real bucket, the real
 * ceiling and the real 429. Mocking it would assert only that the route called a
 * function, which is the shape of test that stays green while the limit is
 * wrong.
 */
const mocks = vi.hoisted(() => ({
  verifyApiKeyOrSession: vi.fn(),
  parseJsonBodyOrResponse: vi.fn(),
  sendMessage: vi.fn(),
  dispatchCampaignSmsBatch: vi.fn(),
  requireDualAuthCapability: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  createCampaign: vi.fn(),
  validateCreateWithScriptPreflight: vi.fn(),
  createScriptForCampaign: vi.fn(),
  linkAudiencesToNewCampaign: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// `env.server` and `logger.server` are replaced outright rather than spread:
// importing the real `env.server` validates the environment at module load, so
// there is nothing to spread without breaking the suite. They are baselined,
// as 70-odd other suites do. Every other shared server module below spreads
// `importOriginal`, so a future export keeps flowing instead of turning an
// unrelated failure into this route's catch-all error (#2213's lesson).
vi.mock("@/lib/env.server", () => ({ env: new Proxy({}, { get: () => () => "test" }) }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/api-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-auth.server")>()),
  verifyApiKeyOrSession: (...args: unknown[]) => mocks.verifyApiKeyOrSession(...(args as [])),
}));
vi.mock("@/lib/api-parse.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-parse.server")>()),
  parseJsonBodyOrResponse: (...args: unknown[]) => mocks.parseJsonBodyOrResponse(...(args as [])),
}));
vi.mock("@/lib/capability-guard.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/capability-guard.server")>()),
  requireDualAuthCapability: async () => ({ type: "ok" }),
  requireDataPlaneCapability: async () => ({ type: "ok" }),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...(args as [])),
}));
vi.mock("@/lib/campaign-sms-dispatch.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-sms-dispatch.server")>()),
  dispatchCampaignSmsBatch: (...args: unknown[]) => mocks.dispatchCampaignSmsBatch(...(args as [])),
}));
vi.mock("@/lib/campaign-sms-send.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-sms-send.server")>()),
  sendMessage: (...args: unknown[]) => mocks.sendMessage(...(args as [])),
}));
vi.mock("@/lib/create-with-script.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/create-with-script.server")>()),
  validateCreateWithScriptPreflight: (...args: unknown[]) =>
    mocks.validateCreateWithScriptPreflight(...(args as [])),
  createScriptForCampaign: (...args: unknown[]) => mocks.createScriptForCampaign(...(args as [])),
  linkAudiencesToNewCampaign: (...args: unknown[]) => mocks.linkAudiencesToNewCampaign(...(args as [])),
}));

const KEY_A = "11111111-1111-4111-8111-111111111111";
const KEY_B = "22222222-2222-4222-8222-222222222222";

function apiKey(keyId = KEY_A) {
  return { authType: "api_key" as const, workspaceId: "ws-1", keyId, scopes: [] };
}

function post(body?: unknown) {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

/** Drive one route until it stops answering 429, and report how many it took. */
async function driveUntilLimited(
  mod: { action: (args: unknown) => unknown },
  limit: number,
  makeRequest: () => Request,
  args: Record<string, unknown> = {},
): Promise<number> {
  for (let attempt = 1; attempt <= limit + 2; attempt += 1) {
    const res = await asRouteResponse(mod.action({ request: makeRequest(), ...args } as never) as never);
    if (res.status === 429) return attempt;
  }
  return -1;
}

beforeEach(() => {
  vi.resetModules();
  resetRateLimitsForTests();
  mocks.verifyApiKeyOrSession.mockReset();
  mocks.parseJsonBodyOrResponse.mockReset();
  mocks.sendMessage.mockReset();
  mocks.dispatchCampaignSmsBatch.mockReset();
  mocks.requireDualAuthCapability.mockReset();
  mocks.requireWorkspaceAccess.mockReset();
  mocks.createCampaign.mockReset();
  mocks.validateCreateWithScriptPreflight.mockReset();
  mocks.createScriptForCampaign.mockReset();
  mocks.linkAudiencesToNewCampaign.mockReset();
  mocks.logger.error.mockReset();
  mocks.logger.info.mockReset();
  mocks.logger.debug.mockReset();
  mocks.verifyApiKeyOrSession.mockResolvedValue(apiKey());
  // A body the routes accept far enough to be *not* a 429. The positive control
  // asserts the throttle did not fire, not that the whole route succeeded —
  // building a fully valid campaign-SMS payload here would make the test a
  // hostage to unrelated schema changes.
  mocks.parseJsonBodyOrResponse.mockResolvedValue({ workspace_id: "ws-1" });
});

describe("api-write-rate-limit — bucket identity", () => {
  test("uses the API key's row id, not the caller IP", () => {
    // The reason `clientRateLimitKey` is not used here: it reads
    // `x-forwarded-for`, which the caller controls. A leaked key rotates that
    // header and never trips an IP bucket.
    expect(apiRateLimitPrincipal(apiKey())).toBe(KEY_A);
    expect(apiRateLimitKey(KEY_A, "api-sms")).toBe(`api-write:api-sms:${KEY_A}`);
    expect(apiRateLimitKey(KEY_A, "api-sms")).not.toContain("127.0.0.1");
    expect(apiRateLimitKey(KEY_A, "api-sms")).not.toContain("undefined");
  });

  test("two keys have separate budgets, and scopes do not share one", () => {
    expect(apiRateLimitKey(KEY_A, "api-sms")).not.toBe(apiRateLimitKey(KEY_B, "api-sms"));
    expect(apiRateLimitKey(KEY_A, "api-sms")).not.toBe(apiRateLimitKey(KEY_A, "api-chat-sms"));
  });

  test("a session caller is bucketed on the user id", () => {
    expect(apiRateLimitPrincipal({ authType: "session", user: { id: "user-9" } })).toBe("user-9");
  });

  test("an unrecognisable auth shape is not throttled, and says so", () => {
    // A missing principal is an auth-layer bug, not a licence for free
    // unlimited writes. Returning "ok" keeps the route's own checks in charge
    // instead of masking the real error behind a 429.
    expect(apiRateLimitPrincipal(undefined)).toBeNull();
    expect(apiRateLimitPrincipal({ authType: "api_key" })).toBeNull();
    expect(apiRateLimitPrincipal({ authType: "api_key", keyId: "" })).toBeNull();
  });

  test("the bucket actually trips at the documented ceiling", async () => {
    const { limit } = API_WRITE_LIMITS["api-sms"];
    for (let i = 0; i < limit; i += 1) {
      expect((await checkApiWriteRateLimit(apiKey(), "api-sms")).ok).toBe(true);
    }
    expect((await checkApiWriteRateLimit(apiKey(), "api-sms")).ok).toBe(false);
    // And the trip is per credential: key B is untouched by key A's spending.
    expect((await checkApiWriteRateLimit(apiKey(KEY_B), "api-sms")).ok).toBe(true);
  });
});

describe("#2135 — /api/sms trips its per-key ceiling", () => {
  test("429s past the ceiling, and not before", async () => {
    const mod = await import("../app/routes/api+/sms");
    const { limit } = API_WRITE_LIMITS["api-sms"];

    for (let i = 0; i < limit; i += 1) {
      const res = await asRouteResponse(
        mod.action({ request: post(), auth: apiKey() } as never) as never,
      );
      expect(res.status).not.toBe(429);
    }

    const blocked = await asRouteResponse(
      mod.action({ request: post(), auth: apiKey() } as never) as never,
    );
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body).toMatchObject({ code: "rate_limited" });
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  test("the limit is per key, so a second key is unaffected", async () => {
    const mod = await import("../app/routes/api+/sms");
    const { limit } = API_WRITE_LIMITS["api-sms"];
    for (let i = 0; i < limit + 1; i += 1) {
      await asRouteResponse(mod.action({ request: post(), auth: apiKey(KEY_A) } as never) as never);
    }
    // The route re-runs its own `auth` strategy, so the identity under test has
    // to change there — passing `auth` to the action does not, the handler's
    // value is overwritten. Getting this wrong is how "per key" tests pass while
    // still sharing one bucket.
    mocks.verifyApiKeyOrSession.mockResolvedValue(apiKey(KEY_B));
    const other = await asRouteResponse(
      mod.action({ request: post(), auth: apiKey(KEY_B) } as never) as never,
    );
    expect(other.status).not.toBe(429);
  });

  test("rotating x-forwarded-for does not reset the bucket", async () => {
    const mod = await import("../app/routes/api+/sms");
    const { limit } = API_WRITE_LIMITS["api-sms"];
    for (let i = 0; i <= limit; i += 1) {
      const req = post();
      req.headers.set("x-forwarded-for", `10.0.0.${i}`);
      await asRouteResponse(mod.action({ request: req, auth: apiKey() } as never) as never);
    }
    const spoofed = post();
    spoofed.headers.set("x-forwarded-for", "203.0.113.99");
    const res = await asRouteResponse(
      mod.action({ request: spoofed, auth: apiKey() } as never) as never,
    );
    expect(res.status).toBe(429);
  });
});

describe("#2135 — /api/chat_sms trips its per-key ceiling", () => {
  test("429s past the ceiling, and not before", async () => {
    const mod = await import("../app/routes/api+/chat_sms");
    const { limit } = API_WRITE_LIMITS["api-chat-sms"];
    for (let i = 0; i < limit; i += 1) {
      const res = await asRouteResponse(
        mod.action({ request: post(), auth: apiKey() } as never) as never,
      );
      expect(res.status).not.toBe(429);
    }
    const blocked = await asRouteResponse(
      mod.action({ request: post(), auth: apiKey() } as never) as never,
    );
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: "rate_limited" });
  });
});

describe("#2135 — /api/campaigns/create-with-script trips its per-key ceiling", () => {
  test("429s past the ceiling, and not before", async () => {
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const { limit } = API_WRITE_LIMITS["api-create-with-script"];
    for (let i = 0; i < limit; i += 1) {
      const res = await asRouteResponse(
        mod.action({ request: post(), auth: apiKey() } as never) as never,
      );
      expect(res.status).not.toBe(429);
    }
    const blocked = await asRouteResponse(
      mod.action({ request: post(), auth: apiKey() } as never) as never,
    );
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: "rate_limited" });
  });

  test("a non-POST method is still rejected by the route's own 405, not the limiter", async () => {
    // Positive control on placement: the limiter must not swallow the route's
    // own method check or turn a 405 into a 429.
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(
      mod.action({
        request: new Request("http://localhost/api/x", { method: "GET" }),
        auth: apiKey(),
      } as never) as never,
    );
    expect(res.status).toBe(405);
  });
});