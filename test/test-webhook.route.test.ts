import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

vi.unmock("@/lib/api-auth.server");
const boundary = vi.hoisted(() => ({
  userId: "user-a" as string | null,
  memberships: new Map<string, string>(),
  outbound: vi.fn(),
  validateUrl: vi.fn(),
}));

vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: async () => ({ user: boundary.userId ? { id: boundary.userId } : null }),
}));
vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: (workspaceId: string) => ({
    workspace_member: {
      findFirst: async ({ where }: { where: SQL }) => {
        const userId = new PgDialect().sqlToQuery(where).params[0];
        const role = boundary.memberships.get(`${workspaceId}:${userId}`);
        return role ? { role_id: role } : undefined;
      },
    },
  }),
}));
vi.mock("@/lib/safe-outbound-url.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/safe-outbound-url.server")>()),
  assertSafeOutboundUrl: (...args: unknown[]) => boundary.validateUrl(...args),
  safeOutboundFetch: (...args: unknown[]) => boundary.outbound(...args),
}));

const WS_A = "11111111-1111-4111-8111-111111111111";
const WS_B = "22222222-2222-4222-8222-222222222222";
const payload = { event_category: "outbound_sms", event_type: "INSERT", payload: { body: "test" } };
type Endpoint = "flat" | "workspace";

async function invoke(endpoint: Endpoint, options: {
  workspaceId?: string; destination?: string; headers?: Record<string, string> | [string, string][];
  body?: unknown; ip?: string; method?: string;
} = {}) {
  const workspaceId = options.workspaceId ?? WS_A;
  const destination = options.destination ?? "https://hooks.example/test";
  const headers = options.headers ?? { "X-Test": "1" };
  const body = options.body ?? (endpoint === "flat" ? {
    workspace_id: workspaceId, event: JSON.stringify(payload), destination_url: destination,
    custom_headers: JSON.stringify(headers),
  } : { event: payload, destination_url: destination, custom_headers: headers });
  const request = new Request(`http://localhost/api/${endpoint === "flat" ? "test-webhook" : `workspaces/${workspaceId}/webhook`}`, {
    method: options.method ?? "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": options.ip ?? "192.0.2.1" },
    body: JSON.stringify(body),
  });
  if (endpoint === "flat") {
    const { action } = await import("../app/routes/api+/test-webhook.action.server");
    return asRouteResponse(action({ request } as never));
  }
  const { action } = await import("../app/routes/api+/workspaces+/$workspaceId/webhook.action.server");
  const args = await withDataPlaneRouteArgs({ request, params: { workspaceId } }, { userId: boundary.userId, workspaceId });
  return asRouteResponse(action(args as never));
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T11:00:00Z"));
  boundary.userId = "user-a";
  boundary.memberships.clear();
  boundary.memberships.set(`${WS_A}:user-a`, "member");
  boundary.memberships.set(`${WS_B}:user-a`, "member");
  boundary.memberships.set(`${WS_A}:user-b`, "member");
  boundary.outbound.mockReset();
  boundary.validateUrl.mockReset();
  boundary.validateUrl.mockResolvedValue(new URL("https://hooks.example/test"));
  boundary.outbound.mockImplementation(async () => Response.json({ received: true }, { status: 202, statusText: "Accepted" }));
  const { resetRateLimitsForTests } = await import("@/lib/platform-rate-limit.server");
  resetRateLimitsForTests();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

for (const endpoint of ["flat", "workspace"] as const) {
  describe(`${endpoint} webhook test action`, () => {
    test.each(["member", "admin", "owner"])("permits %s and forwards the unsaved destination, headers and event", async (role) => {
      boundary.memberships.set(`${WS_A}:user-a`, role);
      const response = await invoke(endpoint, { destination: "https://new.example/unsaved", headers: [["X-Secret", "test-token"]] });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { received: true }, status: 202, statusText: "Accepted" });
      expect(boundary.outbound).toHaveBeenCalledOnce();
      expect(boundary.outbound).toHaveBeenCalledWith("https://new.example/unsaved", expect.objectContaining({
        method: "POST", headers: { "Content-Type": "application/json", "X-Secret": "test-token" }, body: JSON.stringify(payload),
      }));
    });
    test("refuses a caller before DNS or HTTP", async () => {
      boundary.memberships.set(`${WS_A}:user-a`, "caller");
      expect((await invoke(endpoint)).status).toBe(403);
      expect(boundary.validateUrl).not.toHaveBeenCalled();
      expect(boundary.outbound).not.toHaveBeenCalled();
    });
    test("refuses a foreign workspace with the uniform 404", async () => {
      boundary.memberships.delete(`${WS_A}:user-a`);
      expect((await invoke(endpoint)).status).toBe(404);
      expect(boundary.validateUrl).not.toHaveBeenCalled();
      expect(boundary.outbound).not.toHaveBeenCalled();
    });
    test("refuses unauthenticated requests", async () => {
      boundary.userId = null;
      expect((await invoke(endpoint)).status).toBe(401);
      expect(boundary.outbound).not.toHaveBeenCalled();
    });
    test("limits the eleventh delivery with an actionable response", async () => {
      for (let i = 0; i < 10; i++) expect((await invoke(endpoint)).status).toBe(200);
      boundary.validateUrl.mockClear();
      const response = await invoke(endpoint);
      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({ error: "Too many requests", code: "rate_limited" });
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(boundary.outbound).toHaveBeenCalledTimes(10);
      expect(boundary.validateUrl).not.toHaveBeenCalled();
    });
    test("blocks unsafe destinations", async () => {
      boundary.validateUrl.mockRejectedValue(new Error("Destination URL host is not allowed"));
      const response = await invoke(endpoint, { destination: "http://169.254.169.254/latest" });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "Destination URL host is not allowed" });
      expect(boundary.outbound).not.toHaveBeenCalled();
    });
    test("returns provider errors without reporting delivery", async () => {
      boundary.outbound.mockRejectedValue(new Error("Destination timed out"));
      const response = await invoke(endpoint);
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: "Destination timed out" });
    });
    test("does not send when rate-limit storage fails", async () => {
      const limiter = await import("@/lib/platform-rate-limit.server");
      vi.spyOn(limiter, "checkRateLimit").mockRejectedValue(new Error("Rate-limit database unavailable"));
      expect((await invoke(endpoint)).status).toBe(500);
      expect(boundary.validateUrl).not.toHaveBeenCalled();
      expect(boundary.outbound).not.toHaveBeenCalled();
    });
    test("retains text response read-back", async () => {
      boundary.outbound.mockImplementation(async () => new Response("ok", { status: 200 }));
      expect(await (await invoke(endpoint)).json()).toMatchObject({ data: "ok", status: 200 });
    });
  });
}

test("flat requests require a top-level workspace even when the event names one", async () => {
  const response = await invoke("flat", { body: {
    event: JSON.stringify({ ...payload, workspace_id: WS_A }), destination_url: "https://hooks.example/test", custom_headers: "{}",
  } });
  expect(response.status).toBe(404);
  expect(boundary.validateUrl).not.toHaveBeenCalled();
  expect(boundary.outbound).not.toHaveBeenCalled();
});
test("flat action rejects other methods without outbound work", async () => {
  expect((await invoke("flat", { method: "PUT" })).status).toBe(405);
  expect(boundary.outbound).not.toHaveBeenCalled();
});
test.each([
  { event: "{", custom_headers: "{}" },
  { event: "[]", custom_headers: "{}" },
  { event: "{}", custom_headers: '{"X-Test":123}' },
])("invalid flat event/header JSON has no outbound effect: %j", async (values) => {
  const response = await invoke("flat", { body: { workspace_id: WS_A, destination_url: "https://hooks.example/test", ...values } });
  expect(response.status).toBe(400);
  expect(boundary.outbound).not.toHaveBeenCalled();
});
test("both URLs, workspaces, destinations and caller IPs share one user budget", async () => {
  for (let i = 0; i < 5; i++) {
    expect((await invoke("flat")).status).toBe(200);
    expect((await invoke("workspace", { workspaceId: WS_B })).status).toBe(200);
  }
  const response = await invoke("workspace", { workspaceId: WS_B, destination: "https://other.example", ip: "203.0.113.99" });
  expect(response.status).toBe(429);
  expect((await invoke("flat", { workspaceId: WS_B, ip: "203.0.113.77" })).status).toBe(429);
  expect(boundary.outbound).toHaveBeenCalledTimes(10);
  boundary.userId = "user-b";
  expect((await invoke("flat")).status).toBe(200);
  expect(boundary.outbound).toHaveBeenCalledTimes(11);
});
test("one-minute expiry permits another delivery", async () => {
  for (let i = 0; i < 10; i++) await invoke("flat");
  expect((await invoke("workspace")).status).toBe(429);
  vi.setSystemTime(new Date("2026-10-03T11:01:00Z"));
  expect((await invoke("workspace")).status).toBe(200);
  expect(boundary.outbound).toHaveBeenCalledTimes(11);
});
