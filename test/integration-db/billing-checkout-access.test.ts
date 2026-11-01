import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

vi.hoisted(() => {
  process.env.TZ = "UTC";
  process.env.STRIPE_SECRET_KEY = "sk_test_checkout_access";
});
const provider = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: provider.create, retrieve: provider.retrieve } };
  },
}));
vi.mock("@/lib/platform-billing.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/platform-billing.server")>();
  return {
    ...original,
    createBillingCheckoutSession: vi.fn(original.createBillingCheckoutSession),
    pollBillingCheckoutSession: vi.fn(original.pollBillingCheckoutSession),
  };
});

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const roles = ["caller", "member", "admin", "owner"] as const;
const actors = roles.map((role) => ({ role, userId: randomUUID() }));
const outsider = randomUUID();
const startingCredits = 1000;

suite("billing checkout enforces Admin against real rows (#2371)", () => {
  let client: postgres.Sql;
  let services: typeof import("@/lib/platform-billing.server");
  let sessionId: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Checkout access tests require a database URL");
    process.env.DATABASE_URL = databaseUrl;
    client = postgres(databaseUrl, { max: 1 });
    for (const userId of [...actors.map((a) => a.userId), outsider]) {
      await client`insert into public."user" (id, username, created_at)
        values (${userId}::uuid, ${`checkout-${userId}@example.test`}, now())`;
    }
    await client`insert into public.workspace
      (id, name, twilio_data, disabled, feature_flags, credits, stripe_id)
      values (${workspaceId}::uuid, 'Checkout role fixture', '{}'::jsonb, false, '{}'::jsonb,
        ${startingCredits}, 'cus_checkout_access')`;
    for (const actor of actors) {
      await client`insert into public.workspace_member (id, workspace_id, user_id, role_id)
        values (${`checkout:${workspaceId}:${actor.userId}`}, ${workspaceId}, ${actor.userId}, ${actor.role})`;
    }
    services = await import("@/lib/platform-billing.server");
  });

  afterAll(async () => {
    try {
      if (client) {
        await client`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
        await client`delete from public.workspace_member where workspace_id = ${workspaceId}`;
        await client`delete from public.workspace where id = ${workspaceId}::uuid`;
        await client`delete from public."user" where id in ${client([...actors.map((a) => a.userId), outsider])}`;
      }
    } finally {
      await client?.end();
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetIdempotencyForTests } = await import("@/lib/platform-idempotency.server");
    resetIdempotencyForTests();
    sessionId = `cs_test_${randomUUID()}`;
    provider.create.mockResolvedValue({ id: sessionId, url: "https://checkout.example.test/access" });
    provider.retrieve.mockResolvedValue({ status: "open", payment_status: "unpaid", metadata: { workspaceId, creditAmount: "2500" } });
  });

  async function ledgerState() {
    const [balance] = await client<{ credits: number }[]>`
      select credits from public.workspace where id = ${workspaceId}::uuid`;
    const [rows] = await client<{ count: number }[]>`
      select count(*)::int as count from public.transaction_history where workspace = ${workspaceId}::uuid`;
    return { credits: Number(balance.credits), rows: rows.count };
  }

  async function request(route: "create" | "poll", userId: string | null, options: { key?: string; contextWorkspace?: string; missingSession?: boolean } = {}) {
    const { withDataPlaneRouteArgs } = await import("../helpers/route-context-mock");
    const req = new Request(`http://localhost/api/workspaces/${workspaceId}/billing/${route === "create" ? "checkout-session" : `sessions/${sessionId}`}`, {
      method: route === "create" ? "POST" : "GET",
      ...(route === "create" ? { headers: { "Content-Type": "application/json", ...(options.key ? { "Idempotency-Key": options.key } : {}) }, body: JSON.stringify({ amount: 2500 }) } : {}),
    });
    const args = await withDataPlaneRouteArgs({ request: req, params: { workspaceId, ...(!options.missingSession ? { sessionId } : {}) } }, {
      userId, workspaceId: options.contextWorkspace ?? workspaceId,
    });
    if (route === "create") {
      const { action } = await import("../../app/routes/api+/workspaces+/$workspaceId/billing/checkout-session.action.server");
      return asRouteResponse(action(args));
    }
    const { loader } = await import("../../app/routes/api+/workspaces+/$workspaceId/billing/sessions/$sessionId.loader.server");
    return asRouteResponse(loader(args));
  }

  test.each(actors)("$role creation uses the actual route and membership gate", async ({ role, userId }) => {
    const before = await ledgerState();
    const response = await request("create", userId);
    if (role === "caller" || role === "member") {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "Insufficient role" });
      expect(services.createBillingCheckoutSession).not.toHaveBeenCalled();
      expect(provider.create).not.toHaveBeenCalled();
    } else {
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ session_id: sessionId });
      expect(provider.create).toHaveBeenCalledOnce();
    }
    expect(await ledgerState()).toEqual(before);
  });

  test.each(actors)("$role polling uses the actual route and membership gate", async ({ role, userId }) => {
    const before = await ledgerState();
    if (role === "caller" || role === "member") {
      provider.retrieve.mockResolvedValue({ status: "complete", payment_status: "paid", metadata: { workspaceId, creditAmount: "2500" } });
    }
    const response = await request("poll", userId);
    if (role === "caller" || role === "member") {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "Insufficient role" });
      expect(services.pollBillingCheckoutSession).not.toHaveBeenCalled();
      expect(provider.retrieve).not.toHaveBeenCalled();
    } else {
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "open", confirmed: false });
      expect(provider.retrieve).toHaveBeenCalledOnce();
    }
    expect(await ledgerState()).toEqual(before);
  });

  test.each(actors)("$role cannot bypass the route floor with a cached checkout", async ({ role, userId }) => {
    const { storeIdempotentResponse } = await import("@/lib/platform-idempotency.server");
    const key = randomUUID();
    const body = { session_id: sessionId, checkout_url: "https://checkout.example.test/cached" };
    await storeIdempotentResponse(`billing:checkout:${workspaceId}`, key, Response.json(body), body);
    const response = await request("create", userId, { key });
    if (role === "caller" || role === "member") {
      expect(response.status).toBe(403);
      expect(response.headers.get("Idempotency-Replayed")).toBeNull();
      expect(await response.text()).not.toContain(sessionId);
    } else {
      expect(response.status).toBe(200);
      expect(response.headers.get("Idempotency-Replayed")).toBe("true");
      expect(await response.json()).toEqual(body);
    }
    expect(services.createBillingCheckoutSession).not.toHaveBeenCalled();
    expect(provider.create).not.toHaveBeenCalled();
  });

  for (const route of ["create", "poll"] as const) {
    test.each(actors)(`${route} service independently enforces Admin for $role`, async ({ role, userId }) => {
      const before = await ledgerState();
      const result = route === "create"
        ? services.createBillingCheckoutSession({ userId, workspaceId, amount: 2500, requestUrl: "http://localhost" })
        : services.pollBillingCheckoutSession({ userId, workspaceId, sessionId });
      if (role === "caller" || role === "member") {
        await expect(result).rejects.toMatchObject({ statusCode: 403 });
        expect(provider.create).not.toHaveBeenCalled();
        expect(provider.retrieve).not.toHaveBeenCalled();
      } else {
        expect(await result).toMatchObject({ ok: true });
        expect(route === "create" ? provider.create : provider.retrieve).toHaveBeenCalledOnce();
      }
      expect(await ledgerState()).toEqual(before);
    });

    test(`${route} route preserves non-member 404`, async () => {
      const before = await ledgerState();
      expect((await request(route, outsider)).status).toBe(404);
      expect(services.createBillingCheckoutSession).not.toHaveBeenCalled();
      expect(services.pollBillingCheckoutSession).not.toHaveBeenCalled();
      expect(await ledgerState()).toEqual(before);
    });

    test(`${route} route preserves sessionless 401`, async () => {
      expect((await request(route, null)).status).toBe(401);
      expect(services.createBillingCheckoutSession).not.toHaveBeenCalled();
      expect(services.pollBillingCheckoutSession).not.toHaveBeenCalled();
    });

    test(`${route} route preserves mismatched workspace 404`, async () => {
      expect((await request(route, actors[3].userId, { contextWorkspace: otherWorkspaceId })).status).toBe(404);
      expect(services.createBillingCheckoutSession).not.toHaveBeenCalled();
      expect(services.pollBillingCheckoutSession).not.toHaveBeenCalled();
    });

    test(`${route} service preserves non-member 404`, async () => {
      const result = route === "create"
        ? services.createBillingCheckoutSession({ userId: outsider, workspaceId, amount: 2500, requestUrl: "http://localhost" })
        : services.pollBillingCheckoutSession({ userId: outsider, workspaceId, sessionId });
      await expect(result).rejects.toMatchObject({ statusCode: 404 });
      expect(provider.create).not.toHaveBeenCalled();
      expect(provider.retrieve).not.toHaveBeenCalled();
    });
  }

  test.each(actors.filter((a) => a.role === "admin" || a.role === "owner"))("$role confirms a paid session once through the real ledger RPC", async ({ userId }) => {
    const before = await ledgerState();
    provider.retrieve.mockResolvedValue({ status: "complete", payment_status: "paid", metadata: { workspaceId, creditAmount: "2500" } });
    const first = await request("poll", userId);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ confirmed: true, inserted: true, credits_added: 2500 });
    const afterFirst = await ledgerState();
    expect(afterFirst).toEqual({ credits: before.credits + 2500, rows: before.rows + 1 });
    const second = await request("poll", userId);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ confirmed: true, inserted: false, credits_added: 2500 });
    expect(await ledgerState()).toEqual(afterFirst);
  });

  test.each(actors.filter((a) => a.role === "admin" || a.role === "owner"))("$role cannot credit a session belonging to another workspace", async ({ userId }) => {
    const before = await ledgerState();
    provider.retrieve.mockResolvedValue({ status: "complete", payment_status: "paid", metadata: { workspaceId: otherWorkspaceId, creditAmount: "2500" } });
    const response = await request("poll", userId);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Checkout session does not belong to this workspace." });
    expect(await ledgerState()).toEqual(before);
  });

  test.each(actors.filter((a) => a.role === "admin" || a.role === "owner"))("$role keeps the missing-session 400 response", async ({ userId }) => {
    const response = await request("poll", userId, { missingSession: true });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "sessionId is required" });
    expect(services.pollBillingCheckoutSession).not.toHaveBeenCalled();
    expect(provider.retrieve).not.toHaveBeenCalled();
  });
});
