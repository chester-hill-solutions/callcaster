import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const provider = vi.hoisted(() => ({ port: 0 }));
vi.mock("stripe", async (importOriginal) => {
  const original = await importOriginal<typeof import("stripe")>();
  return {
    ...original,
    default: class extends original.default {
      constructor(...[key, config]: ConstructorParameters<typeof original.default>) {
        super(key, { ...config, host: "127.0.0.1", port: provider.port, protocol: "http" });
      }
    },
  };
});

const provisioning = vi.hoisted(() => ({
  intercept: undefined as undefined | ((workspaceId: string) => Promise<void>),
}));
vi.mock("@/lib/database/workspace-twilio-subaccount.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace-twilio-subaccount.server")>(),
  createSubaccount: async ({ workspace_id }: { workspace_id: string }) => {
    await provisioning.intercept?.(workspace_id);
    return undefined;
  },
}));
vi.mock("@/lib/seed/seed-workspace-sample-data.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/seed/seed-workspace-sample-data.server")>(),
  seedWorkspaceSampleData: vi.fn(async () => undefined),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const foreignWorkspaceId = randomUUID();
const ownerId = randomUUID();

suite("canonical Stripe customer uses real database claims and SDK requests (#2115)", () => {
  let client: postgres.Sql;
  let server: Server;
  let billing: typeof import("@/lib/platform-billing.server");
  let requests: { key: string | undefined; fields: URLSearchParams }[];
  let customers: Map<string, string>;
  let sessions: string[];
  let firstResponse: (() => void) | undefined;
  let secondResponse: (() => void) | undefined;
  let synchronizeCreates: boolean;
  let searchResults: unknown[];
  let searchCalls: number;
  let searchQueries: (string | null)[];
  let observedErrors: ReturnType<typeof vi.spyOn>;
  let customerPrefix: string;
  let rejectCreate: boolean;
  let onFirstCreate: (() => void) | undefined;
  let beforeCustomerReply: (() => Promise<void>) | undefined;
  let providerCustomers: Map<string, Record<string, unknown>>;
  let deletions: string[];
  let historyKinds: Set<string>;
  let rejectDelete: boolean;
  let customerOverrides: {
    balance?: number;
    default_source?: string;
    invoice_settings?: { default_payment_method: string };
    metadata?: { callcaster_workspace_id: string };
  };
  const provisionedIds: string[] = [];
  const requestParams = new Map<string, string>();

  async function respondToCustomer(request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse, fields: URLSearchParams, reply: (value: unknown) => void) {
    const key = request.headers["idempotency-key"] as string | undefined;
    requests.push({ key, fields });
    await beforeCustomerReply?.();
    onFirstCreate?.(); onFirstCreate = undefined;
    if (rejectCreate) {
      response.writeHead(400, { "Content-Type": "application/json", "Stripe-Should-Retry": "false" });
      response.end(JSON.stringify({ error: { type: "invalid_request_error", message: "Fixture rejects before execution" } }));
      return;
    }
    if (key && requestParams.has(key) && requestParams.get(key) !== fields.toString()) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { type: "idempotency_error", message: "Parameters changed" } }));
      return;
    }
    if (key) requestParams.set(key, fields.toString());
    const send = () => {
      const identity = key ?? randomUUID();
      let id = customers.get(identity);
      if (!id) { id = `${customerPrefix}_${customers.size + 1}`; customers.set(identity, id); }
      const customer = { id, object: "customer", balance: 0, default_source: null, invoice_settings: { default_payment_method: null },
          name: fields.get("name"), email: fields.get("email"), ...customerOverrides, metadata: { callcaster_workspace_id: fields.get("metadata[callcaster_workspace_id]"),
        callcaster_request_id: fields.get("metadata[callcaster_request_id]"), ...customerOverrides.metadata } };
        if (!providerCustomers.has(id)) providerCustomers.set(id, customer);
        reply(providerCustomers.get(id));
    };
    if (synchronizeCreates && requests.length === 1) { firstResponse = send; return; }
    if (synchronizeCreates) {
      secondResponse = send; firstResponse?.(); firstResponse = undefined; return;
    }
    send(); return;
  }

  async function respondToConflictInspection(method: string | undefined, url: URL,
    response: import("node:http").ServerResponse, reply: (value: unknown) => void) {
    const customerPath = /^\/v1\/customers\/(cus_[^/]+)$/.exec(url.pathname);
    if (customerPath && method === "GET") {
      reply(providerCustomers.get(customerPath[1] ?? ""));
      return true;
    }
    if (customerPath && method === "DELETE") {
      if (rejectDelete) {
        response.writeHead(500, { "Content-Type": "application/json", "Stripe-Should-Retry": "false" });
        response.end(JSON.stringify({ error: { type: "api_error", message: "Fixture deletion failed" } }));
        return true;
      }
      const id = customerPath[1] ?? "";
      deletions.push(id);
      providerCustomers.set(id, { id, object: "customer", deleted: true });
      reply({ id, object: "customer", deleted: true });
      return true;
    }
    const listKind = url.pathname.startsWith("/v1/customers/") && url.pathname.endsWith("/sources")
      ? "sources" : url.pathname.replace("/v1/", "");
    if (method === "GET" && ["checkout/sessions", "invoices", "subscriptions", "charges", "payment_intents", "sources"].includes(listKind)) {
      const queriedCustomer = listKind === "sources" ? url.pathname.split("/")[3] : url.searchParams.get("customer");
      reply({ object: "list", data: historyKinds.has(listKind) && queriedCustomer === `${customerPrefix}_1`
        ? [{ id: "history_fixture" }] : [], has_more: false });
      return true;
    }
    return false;
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Stripe race tests require a database URL");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_customer_race_fixture");
    client = postgres(databaseUrl, { max: 1 });
    await client`insert into public."user" (id, username, created_at)
      values (${ownerId}::uuid, ${`stripe-race-${ownerId}@example.test`}, now())`;
    await client`insert into public.workspace (id, name, twilio_data, disabled, feature_flags, credits, stripe_id)
      values (${workspaceId}::uuid, 'Stripe customer race', '{}'::jsonb, false, '{}'::jsonb, 1000, null),
      (${foreignWorkspaceId}::uuid, 'Foreign customer control', '{}'::jsonb, false, '{}'::jsonb, 1000, 'cus_foreign_control')`;
    await client`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`stripe-race:${workspaceId}:${ownerId}`}, ${workspaceId}, ${ownerId}, 'owner')`;

    server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const fields = new URLSearchParams(Buffer.concat(chunks).toString());
      const reply = (value: unknown) => {
        response.writeHead(200, { "Content-Type": "application/json", "Request-Id": "req_customer_fixture" });
        response.end(JSON.stringify(value));
      };
      if (request.method === "POST" && request.url === "/v1/customers") {
        await respondToCustomer(request, response, fields, reply);
        return;
      }
      if (request.method === "POST" && request.url === "/v1/checkout/sessions") {
        sessions.push(fields.get("customer") ?? "");
        secondResponse?.(); secondResponse = undefined;
        reply({ id: `cs_fixture_${sessions.length}`, object: "checkout.session", url: "https://checkout.example.test/customer-race" });
        return;
      }
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (await respondToConflictInspection(request.method, url, response, reply)) return;
      if (request.method === "GET" && url.pathname === "/v1/customers/search") {
        searchCalls += 1;
        searchQueries.push(url.searchParams.get("query"));
        reply({ object: "search_result", data: searchResults, has_more: false });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/payment_methods") {
        const saved = (historyKinds.has("payment_methods") && url.searchParams.get("customer") === `${customerPrefix}_1`) || url.searchParams.get("customer") === sessions[0];
        reply({ object: "list", data: saved ? [{ id: "pm_saved_fixture", object: "payment_method", customer: sessions[0], type: "card" }] : [], has_more: false });
        return;
      }
      response.writeHead(404); response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Provider fixture did not bind");
    provider.port = address.port;
    billing = await import("@/lib/platform-billing.server");
  });

  beforeEach(async () => {
    observedErrors = vi.spyOn((await import("@/lib/logger.server")).logger, "error");
    customerPrefix = `cus_fixture_${randomUUID().replaceAll("-", "")}`;
    requests = []; customers = new Map(); providerCustomers = new Map(); deletions = []; historyKinds = new Set(); rejectDelete = false; customerOverrides = {}; sessions = []; firstResponse = undefined; secondResponse = undefined; synchronizeCreates = false; searchResults = []; searchCalls = 0; searchQueries = []; rejectCreate = false; requestParams.clear(); provisioning.intercept = undefined; onFirstCreate = undefined; beforeCustomerReply = undefined;
    await client`update public.workspace set stripe_id = 'cus_foreign_control' where id = ${foreignWorkspaceId}::uuid`;
    await client`update public."user" set username = ${`stripe-race-${ownerId}@example.test`} where id = ${ownerId}::uuid`;
    await client`update public.workspace set name = 'Stripe customer race', stripe_id = null, stripe_customer_creation = null, stripe_customer_creation_started_at = null, stripe_customer_conflict = null, stripe_customer_creation_completed_id = null where id = ${workspaceId}::uuid`;
  });

  afterAll(async () => {
    try {
      if (client) {
        await client`delete from public.workspace_member where workspace_id in ${client([workspaceId, ...provisionedIds])}`;
        if (provisionedIds.length) await client`delete from public.workspace where id in ${client(provisionedIds)}`;
        await client`delete from public.workspace where id in ${client([workspaceId, foreignWorkspaceId])}`;
        await client`delete from public."user" where id = ${ownerId}::uuid`;
      }
    } finally {
      firstResponse?.();
      secondResponse?.();
      if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
      await client?.end();
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
      vi.unstubAllEnvs();
    }
  });

  function checkout(id = workspaceId) {
    return billing.createBillingCheckoutSession({ userId: ownerId, workspaceId: id, amount: 2500, requestUrl: "https://app.example.test/billing" });
  }

  async function storedCustomers() {
    return client<{ id: string; stripe_id: string | null }[]>`
      select id, stripe_id from public.workspace where id in ${client([workspaceId, foreignWorkspaceId])} order by id`;
  }

  test("two first checkouts share one provider customer and persisted identity", async () => {
    synchronizeCreates = true;
    const results = await Promise.all([checkout(), checkout()]);
    expect(results).toEqual([expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })]);
    expect.soft(customers.size).toBe(1);
    expect.soft(sessions).toEqual([`${customerPrefix}_1`, `${customerPrefix}_1`]);
    expect(requests).toHaveLength(2);
    expect.soft(requests.map((request) => request.key)).toEqual([
      `workspace:${workspaceId}:stripe-customer`, `workspace:${workspaceId}:stripe-customer`,
    ]);
    expect.soft(await storedCustomers()).toEqual(expect.arrayContaining([
      { id: workspaceId, stripe_id: `${customerPrefix}_1` },
      { id: foreignWorkspaceId, stripe_id: "cus_foreign_control" },
    ]));
    const [stored] = await client<{ stripe_id: string }[]>`select stripe_id from public.workspace where id = ${workspaceId}::uuid`;
    const Stripe = (await import("stripe")).default;
    const sdk = new Stripe("sk_test_customer_race_fixture");
    const paymentMethods = await sdk.paymentMethods.list({ customer: stored.stripe_id, type: "card" });
    expect.soft(paymentMethods.data.map((method) => method.id)).toEqual(["pm_saved_fixture"]);
  });

  test("an existing customer is reused without a customer create request", async () => {
    await client`update public.workspace set stripe_id = 'cus_existing_control' where id = ${workspaceId}::uuid`;
    expect(await checkout()).toMatchObject({ ok: true });
    expect(requests).toEqual([]);
    expect(sessions).toEqual(["cus_existing_control"]);
    expect(await storedCustomers()).toEqual(expect.arrayContaining([
      { id: workspaceId, stripe_id: "cus_existing_control" },
      { id: foreignWorkspaceId, stripe_id: "cus_foreign_control" },
    ]));
  });
  test("checkout during actual workspace setup cannot lose its customer or saved method", async () => {
    let releaseSetup!: () => void;
    const setupGate = new Promise<void>(resolve => { releaseSetup = resolve; });
    let setupReached!: (id: string) => void;
    const setupWaiting = new Promise<string>(resolve => { setupReached = resolve; });
    provisioning.intercept = async id => {
      provisionedIds.push(id);
      setupReached(id);
      await setupGate;
    };
    const setupName = `Setup checkout race ${ownerId}`;
    const trigger = `protect_setup_customer_${ownerId.replaceAll("-", "")}`;
    await client.unsafe(`create function public.${trigger}() returns trigger language plpgsql as $$
      begin if new.name = '${setupName}' and old.stripe_id is not null then
        raise exception 'setup cannot write a claimed customer'; end if; return new; end $$`);
    await client.unsafe(`create trigger ${trigger} before update of stripe_id on public.workspace
      for each row execute function public.${trigger}()`);
    try {
      const setup = await import("@/lib/database/workspace-provisioning.server");
      const setupResult = setup.createNewWorkspace({ workspaceName: setupName, user_id: ownerId });
      const id = await setupWaiting;
      synchronizeCreates = true;
      const firstCreate = new Promise<void>(resolve => { onFirstCreate = resolve; });
      const checkoutResult = checkout(id);
      await firstCreate;
      releaseSetup();
      const [created, checkedOut] = await Promise.all([setupResult, checkoutResult]);
      expect(created).toMatchObject({ data: id, error: null });
      expect(created.provisioningWarning).not.toContain("Stripe");
      expect(created.provisioningWarning).not.toContain("metadata update failed");
      expect(checkedOut).toMatchObject({ ok: true });
      expect(customers.size).toBe(1);
      expect(requests.map(r => r.key)).toEqual([
        `workspace:${id}:stripe-customer`, `workspace:${id}:stripe-customer`,
      ]);
      expect(sessions).toEqual([`${customerPrefix}_1`]);
      const [stored] = await client`select stripe_id, twilio_data::text as twilio_data, credits from public.workspace where id = ${id}::uuid`;
      expect(stored.stripe_id).toBe(`${customerPrefix}_1`);
      expect(JSON.parse(stored.twilio_data).onboarding).toBeTruthy();
      expect(stored.credits).toBe(100);
      const Stripe = (await import("stripe")).default;
      const methods = await new Stripe("sk_test_fixture").paymentMethods.list({ customer: stored.stripe_id, type: "card" });
      expect(methods.data.map(method => method.id)).toEqual(["pm_saved_fixture"]);
      expect(await storedCustomers()).toEqual(expect.arrayContaining([{ id: foreignWorkspaceId, stripe_id: "cus_foreign_control" }]));
    } finally {
      releaseSetup();
      await client.unsafe(`drop trigger ${trigger} on public.workspace`);
      await client.unsafe(`drop function public.${trigger}()`);
    }
  });

  test("a rejected create retries with the frozen name, owner and key", async () => {
    rejectCreate = true;
    expect(await checkout()).toMatchObject({ ok: false });
    expect(customers.size).toBe(0);
    await client`update public.workspace set name = 'Changed workspace' where id = ${workspaceId}::uuid`;
    await client`update public."user" set username = ${`changed-${ownerId}@example.test`} where id = ${ownerId}::uuid`;
    rejectCreate = false;
    expect(await checkout()).toMatchObject({ ok: true });
    expect(requests).toHaveLength(2);
    expect(requests[0].fields.toString()).toBe(requests[1].fields.toString());
    expect(requests[1].fields.get("name")).toBe("Stripe customer race");
    expect(requests[1].fields.get("email")).toBe(`stripe-race-${ownerId}@example.test`);
    expect(requests.map(r => r.key)).toEqual([
      `workspace:${workspaceId}:stripe-customer`, `workspace:${workspaceId}:stripe-customer`,
    ]);
    expect(customers.size).toBe(1);
  });

  test("a lost database acknowledgement reuses the created customer on retry", async () => {
    await client.unsafe(`create function public.reject_stripe_claim_${workspaceId.replaceAll("-", "")}() returns trigger language plpgsql as $$
      begin if new.id = '${workspaceId}'::uuid then raise exception 'fixture claim failure'; end if; return new; end $$`);
    const name = `reject_stripe_claim_${workspaceId.replaceAll("-", "")}`;
    await client.unsafe(`create trigger ${name} before update of stripe_id on public.workspace for each row execute function public.${name}()`);
    try {
      expect(await checkout()).toMatchObject({ ok: false });
      expect(customers.size).toBe(1);
      expect(sessions).toEqual([]);
      const [stored] = await client`select stripe_id from public.workspace where id = ${workspaceId}::uuid`;
      expect(stored.stripe_id).toBeNull();
    } finally {
      await client.unsafe(`drop trigger ${name} on public.workspace`);
      await client.unsafe(`drop function public.${name}()`);
    }
    expect(await checkout()).toMatchObject({ ok: true });
    expect(customers.size).toBe(1);
    expect(sessions).toEqual([`${customerPrefix}_1`]);
  });

  test("the request and customer claim leave a foreign workspace without a customer unchanged", async () => {
    await client`update public.workspace set stripe_id = null where id = ${foreignWorkspaceId}::uuid`;
    expect(await checkout()).toMatchObject({ ok: true });
    const [foreign] = await client`select stripe_id, stripe_customer_creation, stripe_customer_creation_started_at
      from public.workspace where id = ${foreignWorkspaceId}::uuid`;
    expect(foreign).toEqual({ stripe_id: null, stripe_customer_creation: null, stripe_customer_creation_started_at: null });
    expect(sessions).toEqual([`${customerPrefix}_1`]);
  });

  function competingClaim() {
    beforeCustomerReply = async () => {
      await client`update public.workspace set stripe_id = 'cus_competing_claim' where id = ${workspaceId}::uuid`;
    };
  }

  test("an unused losing customer is logged, removed and reconciled before checkout and retry", async () => {
    competingClaim();
    expect(await checkout()).toMatchObject({ ok: true });
    expect(observedErrors).toHaveBeenCalledWith("Stripe customer claim needs reconciliation", {
      workspaceId, unclaimedCustomerId: `${customerPrefix}_1`, canonicalCustomerId: "cus_competing_claim",
    });
    expect(deletions).toEqual([`${customerPrefix}_1`]);
    expect(sessions).toEqual(["cus_competing_claim"]);
    const [row] = await client`select stripe_id, stripe_customer_conflict, stripe_customer_creation_completed_id
      from public.workspace where id = ${workspaceId}::uuid`;
    expect(row).toEqual({ stripe_id: "cus_competing_claim", stripe_customer_conflict: null,
      stripe_customer_creation_completed_id: "cus_competing_claim" });
    expect(await checkout()).toMatchObject({ ok: true });
    expect(requests).toHaveLength(1);
    expect(deletions).toHaveLength(1);
    expect(sessions).toEqual(["cus_competing_claim", "cus_competing_claim"]);
  });

  test("a previously claimed customer stays saved while a checkout could still be in flight", async () => {
    beforeCustomerReply = async () => {
      await client`update public.workspace set stripe_id = 'cus_competing_claim',
        stripe_customer_creation_completed_id = ${`${customerPrefix}_1`} where id = ${workspaceId}::uuid`;
    };
    expect(await checkout()).toMatchObject({ ok: false });
    expect(await checkout()).toMatchObject({ ok: false });
    expect(deletions).toEqual([]);
    expect(sessions).toEqual([]);
    expect(requests).toHaveLength(1);
    const [row] = await client`select stripe_id, stripe_customer_conflict, stripe_customer_creation_completed_id
      from public.workspace where id = ${workspaceId}::uuid`;
    expect(row).toEqual({ stripe_id: "cus_competing_claim",
      stripe_customer_conflict: { unclaimed_id: `${customerPrefix}_1`, canonical_id: "cus_competing_claim" },
      stripe_customer_creation_completed_id: `${customerPrefix}_1` });
  });

  test.each(["checkout/sessions", "payment_methods", "invoices", "subscriptions", "charges", "payment_intents", "sources"])(
    "a losing customer with %s history stays saved and blocks this checkout and retry", async kind => {
      competingClaim(); historyKinds.add(kind);
      expect(await checkout()).toMatchObject({ ok: false });
      expect(await checkout()).toMatchObject({ ok: false });
      expect(deletions).toEqual([]);
      expect(sessions).toEqual([]);
      expect(requests).toHaveLength(1);
      const [row] = await client`select stripe_id, stripe_customer_conflict, stripe_customer_creation_completed_id
        from public.workspace where id = ${workspaceId}::uuid`;
      expect(row).toEqual({ stripe_id: "cus_competing_claim",
        stripe_customer_conflict: { unclaimed_id: `${customerPrefix}_1`, canonical_id: "cus_competing_claim" },
        stripe_customer_creation_completed_id: null });
    },
  );

  test.each([
    { label: "foreign metadata", overrides: { metadata: { callcaster_workspace_id: foreignWorkspaceId } } },
    { label: "credit balance", overrides: { balance: 100 } },
    { label: "legacy default source", overrides: { default_source: "src_saved_fixture" } },
    { label: "default payment method", overrides: { invoice_settings: { default_payment_method: "pm_saved_fixture" } } },
  ])("a losing customer with $label is preserved and blocks retry", async ({ overrides }) => {
    competingClaim(); customerOverrides = overrides;
    expect(await checkout()).toMatchObject({ ok: false });
    expect(await checkout()).toMatchObject({ ok: false });
    expect(deletions).toEqual([]);
    expect(sessions).toEqual([]);
    expect(requests).toHaveLength(1);
    const [row] = await client`select stripe_customer_conflict from public.workspace where id = ${workspaceId}::uuid`;
    expect(row.stripe_customer_conflict).toEqual({ unclaimed_id: `${customerPrefix}_1`, canonical_id: "cus_competing_claim" });
  });

  test("a failed losing-customer removal keeps the conflict until a successful retry", async () => {
    competingClaim(); rejectDelete = true;
    expect(await checkout()).toMatchObject({ ok: false });
    expect(sessions).toEqual([]);
    expect(deletions).toEqual([]);
    rejectDelete = false;
    expect(await checkout()).toMatchObject({ ok: true });
    expect(requests).toHaveLength(1);
    expect(deletions).toEqual([`${customerPrefix}_1`]);
    expect(sessions).toEqual(["cus_competing_claim"]);
  });

  test("a lost reconciliation acknowledgement retries without deleting the customer twice", async () => {
    competingClaim();
    const trigger = `reject_conflict_clear_${workspaceId.replaceAll("-", "")}`;
    await client.unsafe(`create function public.${trigger}() returns trigger language plpgsql as $$
      begin if new.id = '${workspaceId}'::uuid and new.stripe_customer_conflict is null then
        raise exception 'fixture conflict clear failure'; end if; return new; end $$`);
    await client.unsafe(`create trigger ${trigger} before update of stripe_customer_conflict on public.workspace
      for each row execute function public.${trigger}()`);
    try {
      expect(await checkout()).toMatchObject({ ok: false });
      expect(sessions).toEqual([]);
      expect(deletions).toEqual([`${customerPrefix}_1`]);
    } finally {
      await client.unsafe(`drop trigger ${trigger} on public.workspace`);
      await client.unsafe(`drop function public.${trigger}()`);
    }
    expect(await checkout()).toMatchObject({ ok: true });
    expect(requests).toHaveLength(1);
    expect(deletions).toEqual([`${customerPrefix}_1`]);
    expect(sessions).toEqual(["cus_competing_claim"]);
  });

  test("a failed conflict write cannot bypass the pending request on the next checkout", async () => {
    competingClaim();
    const trigger = `reject_customer_conflict_${workspaceId.replaceAll("-", "")}`;
    await client.unsafe(`create function public.${trigger}() returns trigger language plpgsql as $$
      begin if new.id = '${workspaceId}'::uuid then raise exception 'fixture conflict write failure'; end if; return new; end $$`);
    await client.unsafe(`create trigger ${trigger} before update of stripe_customer_conflict on public.workspace
      for each row execute function public.${trigger}()`);
    try {
      expect(await checkout()).toMatchObject({ ok: false });
      expect(sessions).toEqual([]);
      expect(deletions).toEqual([]);
    } finally {
      await client.unsafe(`drop trigger ${trigger} on public.workspace`);
      await client.unsafe(`drop function public.${trigger}()`);
    }
    expect(await checkout()).toMatchObject({ ok: true });
    expect(requests).toHaveLength(2);
    expect(customers.size).toBe(1);
    expect(deletions).toEqual([`${customerPrefix}_1`]);
    expect(sessions).toEqual(["cus_competing_claim"]);
  });

  async function oldRequest() {
    const metadata = { callcaster_workspace_id: workspaceId, callcaster_request_id: randomUUID() };
    const params = { name: "Old request", email: "old@example.test", metadata };
    await client`update public.workspace set stripe_customer_creation = ${client.json(params)},
      stripe_customer_creation_started_at = now() - interval '25 hours' where id = ${workspaceId}::uuid`;
    return metadata;
  }

  test("an old unknown result resolves the matching customer without another create", async () => {
    const metadata = await oldRequest();
    searchResults = [{ id: "cus_recovered", object: "customer", metadata }];
    expect(await checkout()).toMatchObject({ ok: true });
    expect(searchCalls).toBe(1);
    expect(searchQueries).toEqual([`metadata['callcaster_request_id']:'${metadata.callcaster_request_id}'`]);
    expect(requests).toEqual([]);
    expect(sessions).toEqual(["cus_recovered"]);
    expect(await storedCustomers()).toEqual(expect.arrayContaining([{ id: workspaceId, stripe_id: "cus_recovered" }]));
  });

  test.each(["missing", "ambiguous", "foreign"])("an old %s result stops before creating or checking out", async (kind) => {
    const metadata = await oldRequest();
    searchResults = kind === "missing" ? [] : kind === "ambiguous" ? [
      { id: "cus_first", metadata }, { id: "cus_second", metadata },
    ] : [{ id: "cus_foreign", metadata: { ...metadata, callcaster_workspace_id: foreignWorkspaceId } }];
    expect(await checkout()).toMatchObject({ ok: false });
    expect(searchCalls).toBe(1);
    expect(requests).toEqual([]);
    expect(sessions).toEqual([]);
    expect(await storedCustomers()).toEqual(expect.arrayContaining([
      { id: workspaceId, stripe_id: null }, { id: foreignWorkspaceId, stripe_id: "cus_foreign_control" },
    ]));
  });

});
