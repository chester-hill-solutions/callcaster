import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";

vi.hoisted(() => vi.stubEnv("ENV", "local"));
const identity = vi.hoisted(() => ({ userId: null as string | null }));
const stripeConstructor = vi.hoisted(() => vi.fn(() => { throw new Error("Local checkout must not contact Stripe"); }));
vi.mock("stripe", () => ({ default: class { constructor() { stripeConstructor(); } } }));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth.server")>(),
  verifyAuth: async () => {
    if (!identity.userId) throw new Response(null, { status: 302, headers: { Location: "/signin" } });
    return { user: { id: identity.userId }, headers: new Headers() };
  },
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const roles = ["caller", "member", "admin", "owner"] as const;
const actors = roles.map(role => ({ role, userId: randomUUID() }));
const ownerId = actors.find(actor => actor.role === "owner")!.userId;
const outsider = randomUUID();

suite("local checkout uses real roles and ledger without provider traffic (#2828)", () => {
  let client: postgres.Sql;
  let billing: typeof import("@/lib/platform-billing.server");
  let pools: Pick<typeof import("@/server/db"), "pool" | "directPool">;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Local checkout tests require a database URL");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    client = postgres(databaseUrl, { max: 1 });
    pools = await import("@/server/db");
    billing = await import("@/lib/platform-billing.server");
    for (const userId of [...actors.map(actor => actor.userId), outsider]) {
      await client`insert into public."user" (id, username) values (${userId}::uuid, ${`local-checkout-${userId}@example.test`})`;
    }
    await client`insert into public.workspace (id, name, twilio_data, credits)
      values (${workspaceId}::uuid, 'Local checkout fixture', '{}'::jsonb, 1000)`;
    for (const actor of actors) {
      await client`insert into public.workspace_member (id, workspace_id, user_id, role_id)
        values (${`local-checkout:${workspaceId}:${actor.userId}`}, ${workspaceId}, ${actor.userId}, ${actor.role})`;
    }
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      if (client) {
        await client`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
        await client`delete from public.workspace_member where workspace_id = ${workspaceId}`;
        await client`delete from public.workspace where id = ${workspaceId}::uuid`;
        await client`delete from public."user" where id in ${client([...actors.map(actor => actor.userId), outsider])}`;
      }
    } catch (error) { errors.push(error); }
    try { await client?.end(); } catch (error) { errors.push(error); }
    try { await pools?.pool.end(); } catch (error) { errors.push(error); }
    try { await pools?.directPool.end(); } catch (error) { errors.push(error); }
    finally { vi.unstubAllEnvs(); }
    if (errors.length) throw new AggregateError(errors, "Local checkout fixture cleanup failed");
  });

  beforeEach(async () => {
    identity.userId = ownerId;
    await client`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await client`update public.workspace set credits = 1000 where id = ${workspaceId}::uuid`;
  });

  async function ledger() {
    const [row] = await client`select credits, (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as entries
      from public.workspace where id = ${workspaceId}::uuid`;
    return { credits: Number(row.credits), entries: row.entries };
  }

  async function create(userId = ownerId) {
    return billing.createBillingCheckoutSession({ userId, workspaceId, amount: 500, requestUrl: "http://localhost:3000/billing" });
  }

  async function session() {
    const result = await create();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected local checkout");
    expect(result.checkout_url).toBe(`http://localhost:3000/mock-checkout/${result.session_id}`);
    return result.session_id;
  }

  async function checkoutRoute(method: "GET" | "POST", sessionId: string) {
    const args = routeArgs(new Request(`http://localhost:3000/mock-checkout/${sessionId}`, { method }), { sessionId });
    if (method === "GET") {
      const { loader } = await import("../../app/routes/mock-checkout.$sessionId.loader.server");
      return asRouteResponse(loader(args as Parameters<typeof loader>[0]));
    }
    const { action } = await import("../../app/routes/mock-checkout.$sessionId.action.server");
    return asRouteResponse(action(args as Parameters<typeof action>[0]));
  }

  test.each(actors)("$role creation obeys the billing role floor", async ({ role, userId }) => {
    const result = create(userId);
    if (role === "admin" || role === "owner") {
      expect(await result).toMatchObject({ ok: true, session_id: expect.stringMatching(/^mock_/) });
    } else await expect(result).rejects.toMatchObject({ statusCode: 403 });
    expect(await ledger()).toEqual({ credits: 1000, entries: 0 });
    expect(stripeConstructor).not.toHaveBeenCalled();
  });

  test.each(actors)("$role page and completion obey the real workspace role", async ({ role, userId }) => {
    const id = await session();
    identity.userId = userId;
    const page = await checkoutRoute("GET", id);
    const submitted = await checkoutRoute("POST", id);
    if (role === "admin" || role === "owner") {
      expect(await page.json()).toEqual({ creditAmount: 500 });
      expect(submitted.headers.get("Location")).toBe(`/confirm-payment?session_id=${id}`);
    } else {
      expect(page.status).toBe(403);
      expect(submitted.status).toBe(403);
      expect(await billing.pollBillingCheckoutSession({ userId: ownerId, workspaceId, sessionId: id })).toMatchObject({ confirmed: false, payment_status: "unpaid" });
    }
    expect(await ledger()).toEqual({ credits: 1000, entries: 0 });
    expect(stripeConstructor).not.toHaveBeenCalled();
  });

  test("an outsider cannot read or complete another workspace's session", async () => {
    const id = await session();
    identity.userId = outsider;
    expect((await checkoutRoute("GET", id)).status).toBe(404);
    expect((await checkoutRoute("POST", id)).status).toBe(404);
    expect(await billing.pollBillingCheckoutSession({ userId: ownerId, workspaceId, sessionId: id })).toMatchObject({ confirmed: false });
    expect(await ledger()).toEqual({ credits: 1000, entries: 0 });
  });

  test("anonymous requests must sign in before reading or completing a session", async () => {
    const id = await session();
    identity.userId = null;
    for (const method of ["GET", "POST"] as const) {
      const result = await checkoutRoute(method, id);
      expect(result.status).toBe(302);
      expect(result.headers.get("Location")).toBe("/signin");
    }
    expect(await ledger()).toEqual({ credits: 1000, entries: 0 });
  });

  test("unknown sessions return 404", async () => {
    expect((await checkoutRoute("GET", "mock_missing")).status).toBe(404);
    expect((await checkoutRoute("POST", "mock_missing")).status).toBe(404);
    expect(await ledger()).toEqual({ credits: 1000, entries: 0 });
  });

  test("an unpaid session cannot grant credits through the confirmation route", async () => {
    const id = await session();
    const { loader } = await import("../../app/routes/confirm-payment.loader.server");
    const result = await asRouteResponse(loader(routeArgs(new Request(`http://localhost:3000/confirm-payment?session_id=${id}`)) as Parameters<typeof loader>[0]));
    expect(result.headers.get("Location")).toContain("payment_status=error");
    expect(await ledger()).toEqual({ credits: 1000, entries: 0 });
  });

  test("concurrent completion, polling and confirmation grant credits exactly once", async () => {
    const id = await session();
    const completed = await Promise.all([checkoutRoute("POST", id), checkoutRoute("POST", id)]);
    expect(completed.map(response => response.status)).toEqual([302, 302]);
    const { loader } = await import("../../app/routes/confirm-payment.loader.server");
    const confirmations = await Promise.all([
      ...Array.from({ length: 3 }, () => asRouteResponse(loader(routeArgs(new Request(`http://localhost:3000/confirm-payment?session_id=${id}`)) as Parameters<typeof loader>[0]))),
      billing.pollBillingCheckoutSession({ userId: ownerId, workspaceId, sessionId: id }),
    ]);
    expect(confirmations.slice(0, 3)).toEqual(Array.from({ length: 3 }, () => expect.objectContaining({ status: 302 })));
    expect(confirmations[3]).toMatchObject({ confirmed: true, credits_added: 500 });
    expect(await ledger()).toEqual({ credits: 1500, entries: 1 });
    const [entry] = await client`select idempotency_key from public.transaction_history where workspace = ${workspaceId}::uuid`;
    expect(entry.idempotency_key).toBe(`stripe_session:${id}`);
    expect(stripeConstructor).not.toHaveBeenCalled();
  });
});
