import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { asRouteResponse } from "../helpers/route-result";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => { process.env.TZ = "UTC"; process.env.BASE_URL = "http://localhost:3038"; });
const authState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth.server")>(),
  getSession: vi.fn(async () => ({ user: authState.userId ? { id: authState.userId } : null, headers: new Headers() })),
}));
const provider = vi.hoisted(() => ({ accountSid: "AC00000000000000000000000000002084", create: vi.fn(), remove: vi.fn(), list: vi.fn(), active: new Set<string>(), records: new Map<string, { sid: string; accountSid: string; phoneNumber: string; friendlyName: string }>() }));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/database/workspace.server")>();
  return { ...original, createWorkspaceTwilioInstance: vi.fn(async () => ({
    accountSid: provider.accountSid,
    incomingPhoneNumbers: Object.assign((sid: string) => ({ remove: () => provider.remove(sid) }), { create: provider.create, list: provider.list }),
  })) };
});
vi.mock("@/lib/database/workspace-twilio-config.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace-twilio-config.server")>(),
  deriveAndPersistWorkspaceThroughput: vi.fn(async () => undefined),
}));
vi.mock("@/lib/database/workspace-twilio-sync.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace-twilio-sync.server")>(),
  syncWorkspaceTwilioSnapshot: vi.fn(async () => undefined),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspaceId = randomUUID(), actor = randomUUID(), caller = randomUUID();
const tag = randomUUID().replaceAll("-", "");
const fn = `purchase_fault_${tag}`, trigger = `purchase_fault_${tag}`;
const schemaName = `purchase_${tag}`, publicControlId = randomUUID(), publicControlLease = randomUUID();
let fixture: postgres.Sql;
let sql: postgres.Sql;
let service: typeof import("@/lib/platform-workspace-numbers.server");
let faultTable: string | undefined;
const originalEnv = { DATABASE_URL: process.env.DATABASE_URL, DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL };
const address = { street: "1 Fixture Street", city: "Toronto", region: "ON", postalCode: "M5V 1A1", countryCode: "CA", status: "not_started" };

describe("number purchase preserves credits and inventory (#2084)", () => {
  beforeAll(async () => {
    if (!url) throw new Error("Owned database URL required");
    fixture = postgres(url, { max: 1 });
    await fixture.unsafe(`create schema "${schemaName}"`);
    const migration = await readFile(new URL("../../client/migrations/20261006000000_number_purchase_recovery.sql", import.meta.url), "utf8");
    await fixture.unsafe(migration.replaceAll("public.workspace_number_purchase", `"${schemaName}".workspace_number_purchase`));
    const scopedUrl = new URL(url);
    scopedUrl.searchParams.set("search_path", `${schemaName},public`);
    process.env.DATABASE_URL = scopedUrl.toString(); process.env.DATABASE_DIRECT_URL = scopedUrl.toString();
    sql = postgres(scopedUrl.toString(), { max: 3 });
    for (const id of [actor, caller]) await sql`insert into public."user" (id, username, created_at) values (${id}::uuid, ${`purchase-${id}@example.test`}, now())`;
    await sql`insert into public.workspace (id, name, credits, twilio_data, disabled, feature_flags) values (${workspaceId}::uuid, 'Purchase fixture', 100, '{}'::jsonb, false, '{}'::jsonb)`;
    for (const [id, role] of [[actor, "owner"], [caller, "caller"]]) await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id) values (${`purchase:${workspaceId}:${id}`}, ${workspaceId}, ${id}, ${role})`;
    await fixture`insert into public.workspace_number_purchase
      (id, workspace, actor_user_id, phone_number, account_sid, credits, state, lease_token, lease_expires_at)
      values (${publicControlId}::uuid, ${workspaceId}::uuid, ${actor}, '+14165550999',
        'AC00000000000000000000000000009999', 100, 'reserved', ${publicControlLease}::uuid, now() - interval '1 day')`;
    service = await import("@/lib/platform-workspace-numbers.server");
  });
  async function clearFault() {
    if (faultTable) { await sql.unsafe(`drop trigger if exists ${trigger} on ${faultTable === "workspace_number_purchase" ? `"${schemaName}".workspace_number_purchase` : `public.${faultTable}`}`); faultTable = undefined; }
    await sql.unsafe(`drop function if exists public.${fn}()`);
  }
  afterEach(async () => {
    if (sql) await clearFault();
    if (fixture) {
      const [control] = await fixture`select state, lease_token from public.workspace_number_purchase where id = ${publicControlId}::uuid`;
      expect(control).toEqual({ state: "reserved", lease_token: publicControlLease });
    }
  });
  afterAll(async () => {
    try {
      if (sql) {
        await clearFault();
        await sql`delete from public.workspace_number where workspace = ${workspaceId}::uuid`;
        await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
        await sql`delete from public.workspace_member where workspace_id = ${workspaceId}`;
        await sql`delete from public.workspace where id = ${workspaceId}::uuid`;
        await sql`delete from public."user" where id in (${actor}::uuid, ${caller}::uuid)`;
      }
    } finally {
      await sql?.end();
      if (service) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
      if (fixture) { await fixture.unsafe(`drop schema if exists "${schemaName}" cascade`); await fixture.end(); }
      for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
  beforeEach(async () => {
    authState.userId = actor;
    provider.accountSid = "AC00000000000000000000000000002084";
    provider.active.clear();
    provider.records.clear();
    provider.list.mockImplementation(async () => [...provider.records.values()].filter((row) => provider.active.has(row.sid)));
    provider.create.mockImplementation(async ({ phoneNumber, friendlyName }: { phoneNumber: string; friendlyName: string }) => {
      const sid = `PN${randomUUID().replaceAll("-", "")}`; provider.active.add(sid);
      const row = { sid, accountSid: "AC00000000000000000000000000002084", phoneNumber, friendlyName, capabilities: { mms: true, sms: true, voice: true } };
      provider.records.set(sid, row);
      return row;
    });
    provider.remove.mockImplementation(async (sid: string) => { provider.active.delete(sid); return true; });
    await sql`delete from public.workspace_number where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await sql`delete from workspace_number_purchase where workspace = ${workspaceId}::uuid`;
    const data = { onboarding: { emergencyVoice: { address }, messagingService: { serviceSid: null } } };
    await sql`update public.workspace set credits = 100, twilio_data = ${sql.json(data)} where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server"); invalidateWorkspaceTwilioData(workspaceId);
  });
  async function activeReservations() {
    const [row] = await sql`select count(*)::int as count from workspace_number_purchase
      where workspace = ${workspaceId}::uuid and state not in ('completed', 'cancelled')`;
    return row.count;
  }
  async function expireReservations() {
    await sql`update workspace_number_purchase set lease_expires_at = now() - interval '1 minute'
      where workspace = ${workspaceId}::uuid and state not in ('completed', 'cancelled')`;
  }
  async function state() {
    const [row] = await sql`select credits,
      (select count(*)::int from public.workspace_number where workspace = ${workspaceId}::uuid) as numbers,
      (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger
      from public.workspace where id = ${workspaceId}::uuid`;
    return { credits: Number(row.credits), numbers: row.numbers, ledger: row.ledger, active: provider.active.size };
  }
  test("one affordable purchase persists one number and a 100-credit debit", async () => {
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: true, status: 201 });
    expect(await state()).toEqual({ credits: 0, numbers: 1, ledger: 1, active: 1 });
    expect(await activeReservations()).toBe(0);
  });
  test("insufficient credits stop before provider creation", async () => {
    await sql`update public.workspace set credits = 99 where id = ${workspaceId}::uuid`;
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false, status: 402 });
    expect(provider.create).not.toHaveBeenCalled();
    expect(await state()).toEqual({ credits: 99, numbers: 0, ledger: 0, active: 0 });
    expect(await activeReservations()).toBe(0);
  });
  test("Caller is denied before provider creation", async () => {
    expect(await service.purchaseWorkspaceNumber(caller, workspaceId, "+14165550001")).toMatchObject({ ok: false, status: 403 });
    expect(provider.create).not.toHaveBeenCalled();
    expect(await state()).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 0 });
    expect(await activeReservations()).toBe(0);
  });
  test("a definite provider rejection preserves credits and local inventory", async () => {
    provider.create.mockRejectedValue(Object.assign(new Error("Synthetic unavailable number"), { status: 400, code: 21422 }));
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false });
    expect(await state()).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 0 });
    expect(await activeReservations()).toBe(0);
  });
  test("two different concurrent purchases with one rental budget allow exactly one create", async () => {
    let enterSecond!: () => void, release!: () => void;
    const bothEntered = new Promise<void>((resolve) => { enterSecond = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered = 0;
    provider.create.mockImplementation(async ({ phoneNumber, friendlyName }: { phoneNumber: string; friendlyName: string }) => {
      if (++entered === 2) enterSecond();
      await gate;
      const sid = `PN${randomUUID().replaceAll("-", "")}`; provider.active.add(sid);
      const row = { sid, accountSid: "AC00000000000000000000000000002084", phoneNumber, friendlyName, capabilities: { mms: true, sms: true, voice: true } };
      provider.records.set(sid, row);
      return row;
    });
    const pending = Promise.all([service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001"), service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550002")]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([bothEntered, new Promise<void>((resolve) => { timer = setTimeout(resolve, 1000); })]); }
    finally { if (timer) clearTimeout(timer); release(); }
    const results = await pending;
    const persisted = await state();
    expect(persisted.credits).toBeGreaterThanOrEqual(0);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.status === 402)).toHaveLength(1);
    expect(provider.create).toHaveBeenCalledOnce();
    expect(persisted).toEqual({ credits: 0, numbers: 1, ledger: 1, active: 1 });
    expect(await activeReservations()).toBe(0);
  });
  test.each([
    { stage: "number insert", table: "workspace_number", event: "insert", column: "workspace" },
    { stage: "onboarding write", table: "workspace", event: "update of twilio_data", column: "id" },
    { stage: "ledger debit", table: "transaction_history", event: "insert", column: "workspace" },
  ])("provider success followed by $stage failure releases the number and preserves credits", async ({ table, event, column }) => {
    await sql.unsafe(`create function public.${fn}() returns trigger language plpgsql as $$ begin raise exception 'Owned purchase write fault'; end $$`);
    await sql.unsafe(`create trigger ${trigger} before ${event} on public.${table} for each row when (new.${column} = '${workspaceId}'::uuid) execute function public.${fn}()`);
    faultTable = table;
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false });
    const persisted = await state();
    expect(persisted).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 0 });
    expect(await activeReservations()).toBe(0);
  });
  test("a repeated purchase of an owned number does not create or debit again", async () => {
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: true });
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false, status: 409 });
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toEqual({ credits: 0, numbers: 1, ledger: 1, active: 1 });
    expect(await activeReservations()).toBe(0);
  });
  test("credits drained by another billed operation cannot become a negative purchase balance", async () => {
    const create = provider.create.getMockImplementation();
    if (!create) throw new Error("Synthetic provider implementation is required");
    provider.create.mockImplementation(async (input) => {
      const row = await create(input);
      await sql`update public.workspace set credits = 0 where id = ${workspaceId}::uuid`;
      return row;
    });
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false });
    expect(await state()).toEqual({ credits: 0, numbers: 0, ledger: 0, active: 0 });
    expect(await activeReservations()).toBe(0);
  });
  test("uncertain creation retains its hold and the recovery sweep releases its exact marked number", async () => {
    const create = provider.create.getMockImplementation();
    if (!create) throw new Error("Synthetic provider implementation is required");
    provider.create.mockImplementation(async (input) => {
      await create(input);
      throw Object.assign(new Error("Synthetic create timeout"), { code: "ETIMEDOUT" });
    });
    provider.list.mockRejectedValueOnce(new Error("Synthetic verification unavailable"));
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false });
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 1 });
    expect(await activeReservations()).toBe(1);
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550002")).toMatchObject({ ok: false, status: 402 });
    await expireReservations();
    const { runNumberPurchaseRecovery } = await import("@/lib/number-purchase-recovery.server");
    expect(await runNumberPurchaseRecovery()).toEqual({ examined: 1, cancelled: 1, pending: 0 });
    expect(provider.remove).toHaveBeenCalledWith([...provider.records.keys()][0]);
    expect(await state()).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 0 });
    expect(await activeReservations()).toBe(0);
    expect(provider.create).toHaveBeenCalledOnce();
  });
  test("a timeout without a visible matching number cannot release its budget", async () => {
    provider.create.mockRejectedValue(Object.assign(new Error("Synthetic create timeout"), { code: "ETIMEDOUT" }));
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false });
    await expireReservations();
    const { runNumberPurchaseRecovery } = await import("@/lib/number-purchase-recovery.server");
    expect(await runNumberPurchaseRecovery()).toEqual({ examined: 1, cancelled: 0, pending: 1 });
    expect(await activeReservations()).toBe(1);
    expect(provider.remove).not.toHaveBeenCalled();
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550002")).toMatchObject({ ok: false, status: 402 });
    expect(await state()).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 0 });
  });
  test("a failed provider release remains durable and the sweep can finish it later", async () => {
    await sql.unsafe(`create function public.${fn}() returns trigger language plpgsql as $$ begin raise exception 'Owned purchase write fault'; end $$`);
    await sql.unsafe(`create trigger ${trigger} before insert on public.workspace_number for each row when (new.workspace = '${workspaceId}'::uuid) execute function public.${fn}()`);
    faultTable = "workspace_number";
    provider.remove.mockRejectedValue(new Error("Synthetic release unavailable"));
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false });
    expect(await activeReservations()).toBe(1);
    expect(await state()).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 1 });
    await clearFault();
    provider.remove.mockImplementation(async (sid: string) => { provider.active.delete(sid); return true; });
    await expireReservations();
    const { runNumberPurchaseRecovery } = await import("@/lib/number-purchase-recovery.server");
    expect(await runNumberPurchaseRecovery()).toEqual({ examined: 1, cancelled: 1, pending: 0 });
    expect(await state()).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 0 });
    expect(await activeReservations()).toBe(0);
  });
  test("failure after the ledger write rolls back inventory and never emits a false debit event", async () => {
    await sql.unsafe(`create function public.${fn}() returns trigger language plpgsql as $$ begin raise exception 'Owned purchase completion fault'; end $$`);
    await sql.unsafe(`create trigger ${trigger} before update on workspace_number_purchase for each row when (new.workspace = '${workspaceId}'::uuid and new.state = 'completed') execute function public.${fn}()`);
    faultTable = "workspace_number_purchase";
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false });
    expect(await state()).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 0 });
    expect(await activeReservations()).toBe(0);
    const { emitTransactionHistoryInsertEvent } = await import("@/lib/workspace-events.server");
    expect(emitTransactionHistoryInsertEvent).not.toHaveBeenCalled();
  });

  test.each(["flat", "workspace"])("%s HTTP purchase preserves the 409 recovery conflict", async (route) => {
    const { withDataPlaneRouteArgs } = await import("../helpers/route-context-mock");
    async function send() {
      const path = route === "flat" ? "/api/numbers" : `/api/workspaces/${workspaceId}/numbers`;
      const request = new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: workspaceId, phone_number: "+14165550001" }) });
      const args = await withDataPlaneRouteArgs({ request, params: { workspaceId } }, { userId: actor, workspaceId });
      if (route === "flat") { const { action } = await import("../../app/routes/api+/numbers.action.server"); return asRouteResponse(action(args)); }
      const { action } = await import("../../app/routes/api+/workspaces+/$workspaceId/numbers.action.server");
      return asRouteResponse(action(args));
    }
    expect((await send()).status).toBe(201);
    const response = await send();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("already owned") });
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toEqual({ credits: 0, numbers: 1, ledger: 1, active: 1 });
    expect(await activeReservations()).toBe(0);
  });
  test("a stale reservation that never began provider creation releases its budget", async () => {
    const { reserveNumberPurchase } = await import("@/server/number-purchase-reservation.server");
    expect(await reserveNumberPurchase({ workspaceId, actorUserId: actor, phoneNumber: "+14165550001", accountSid: "AC00000000000000000000000000002084" })).toMatchObject({ ok: true });
    await expireReservations();
    const { runNumberPurchaseRecovery } = await import("@/lib/number-purchase-recovery.server");
    expect(await runNumberPurchaseRecovery()).toEqual({ examined: 1, cancelled: 1, pending: 0 });
    expect(provider.create).not.toHaveBeenCalled();
    expect(provider.remove).not.toHaveBeenCalled();
    expect(await activeReservations()).toBe(0);
    expect(await state()).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 0 });
  });
  test("recovery cannot release a different purchase of the same phone", async () => {
    provider.create.mockRejectedValue(Object.assign(new Error("Synthetic create timeout"), { code: "ETIMEDOUT" }));
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false, status: 409 });
    const sid = "PN00000000000000000000000000002084";
    provider.active.add(sid);
    provider.records.set(sid, { sid, accountSid: "AC00000000000000000000000000002084", phoneNumber: "+14165550001", friendlyName: "A different purchase" });
    await expireReservations();
    const { runNumberPurchaseRecovery } = await import("@/lib/number-purchase-recovery.server");
    expect(await runNumberPurchaseRecovery()).toEqual({ examined: 1, cancelled: 0, pending: 1 });
    expect(provider.remove).not.toHaveBeenCalled();
    expect(provider.active.has(sid)).toBe(true);
    expect(await activeReservations()).toBe(1);
  });

  test("concurrent requests for the same phone create and debit once", async () => {
    const results = await Promise.all([
      service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001"),
      service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001"),
    ]);
    expect(results.filter((row) => row.ok)).toHaveLength(1);
    expect(results.filter((row) => !row.ok && row.status === 409)).toHaveLength(1);
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toEqual({ credits: 0, numbers: 1, ledger: 1, active: 1 });
  });
  test("two affordable purchases preserve both emergency onboarding entries", async () => {
    await sql`update public.workspace set credits = 200,
      twilio_data = jsonb_set(twilio_data, '{onboarding,emergencyVoice,address,status}', '"validated"'::jsonb)
      where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
    const results = await Promise.all([
      service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001"),
      service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550002"),
    ]);
    expect(results.every((row) => row.ok)).toBe(true);
    expect(await state()).toEqual({ credits: 0, numbers: 2, ledger: 2, active: 2 });
    const [row] = await sql`select twilio_data from public.workspace where id = ${workspaceId}::uuid`;
    expect(row.twilio_data.onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.sort()).toEqual(["+14165550001", "+14165550002"]);
  });
  test("a recovery lease prevents the stale request from finalizing or cancelling", async () => {
    const { reserveNumberPurchase, startNumberPurchase, recordNumberPurchaseProvider, claimNumberPurchaseRecovery, finalizeNumberPurchase, cancelNumberPurchase } = await import("@/server/number-purchase-reservation.server");
    const reserved = await reserveNumberPurchase({ workspaceId, actorUserId: actor, phoneNumber: "+14165550001", accountSid: provider.accountSid });
    if (!reserved.ok) throw new Error("Fixture reservation required");
    await startNumberPurchase(reserved.purchase);
    await recordNumberPurchaseProvider(reserved.purchase, "PN00000000000000000000000000002084");
    await expireReservations();
    const claimed = await claimNumberPurchaseRecovery();
    expect(claimed).toHaveLength(1);
    expect(claimed[0].lease_token).not.toBe(reserved.purchase.lease_token);
    const write = vi.fn();
    await expect(finalizeNumberPurchase(reserved.purchase, "PN00000000000000000000000000002084", "Fixture", write)).rejects.toThrow("no longer owned");
    expect(write).not.toHaveBeenCalled();
    await cancelNumberPurchase(reserved.purchase);
    expect(await activeReservations()).toBe(1);
    expect(await state()).toEqual({ credits: 100, numbers: 0, ledger: 0, active: 0 });
    await cancelNumberPurchase(claimed[0]);
    expect(await activeReservations()).toBe(0);
  });
  test("two sweep claims cannot own the same expired reservation", async () => {
    const { reserveNumberPurchase, claimNumberPurchaseRecovery } = await import("@/server/number-purchase-reservation.server");
    expect(await reserveNumberPurchase({ workspaceId, actorUserId: actor, phoneNumber: "+14165550001", accountSid: provider.accountSid })).toMatchObject({ ok: true });
    await expireReservations();
    const claims = await Promise.all([claimNumberPurchaseRecovery(), claimNumberPurchaseRecovery()]);
    expect(claims.flat()).toHaveLength(1);
  });
  test("a completed purchase cannot be compensated or claimed again", async () => {
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: true });
    const { workspace_number_purchase } = await import("@/db/schema");
    const { db } = await import("@/server/db");
    const { eq } = await import("drizzle-orm");
    const [purchase] = await db.select().from(workspace_number_purchase).where(eq(workspace_number_purchase.workspace, workspaceId));
    const { createWorkspaceTwilioInstance } = await import("@/lib/database/workspace.server");
    const { compensateNumberPurchase, runNumberPurchaseRecovery } = await import("@/lib/number-purchase-recovery.server");
    expect(await compensateNumberPurchase(purchase, await createWorkspaceTwilioInstance({ workspace_id: workspaceId }))).toBe(false);
    await sql`update workspace_number_purchase set lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    expect(await runNumberPurchaseRecovery()).toEqual({ examined: 0, cancelled: 0, pending: 0 });
    expect(provider.remove).not.toHaveBeenCalled();
    expect(await state()).toEqual({ credits: 0, numbers: 1, ledger: 1, active: 1 });
  });
  test.each(["wrong account", "different phone", "ambiguous match"])("unknown creation with %s retains its hold", async (kind) => {
    provider.create.mockRejectedValue(Object.assign(new Error("Synthetic create timeout"), { code: "ETIMEDOUT" }));
    expect(await service.purchaseWorkspaceNumber(actor, workspaceId, "+14165550001")).toMatchObject({ ok: false, status: 409 });
    const [purchase] = await sql`select id from workspace_number_purchase where workspace = ${workspaceId}::uuid`;
    const row = { sid: "PN00000000000000000000000000002084", accountSid: provider.accountSid, phoneNumber: "+14165550001", friendlyName: `[purchase:${purchase.id}]` };
    if (kind === "wrong account") row.accountSid = "AC00000000000000000000000000009999";
    if (kind === "different phone") row.phoneNumber = "+14165550002";
    provider.records.set(row.sid, row); provider.active.add(row.sid);
    if (kind === "ambiguous match") {
      const other = { ...row, sid: "PN00000000000000000000000000009999" };
      provider.records.set(other.sid, other); provider.active.add(other.sid);
    }
    await expireReservations();
    const { runNumberPurchaseRecovery } = await import("@/lib/number-purchase-recovery.server");
    expect(await runNumberPurchaseRecovery()).toEqual({ examined: 1, cancelled: 0, pending: 1 });
    expect(provider.remove).not.toHaveBeenCalled();
    expect(await activeReservations()).toBe(1);
    expect((await state()).credits).toBe(100);
  });
  test("a changed provider account cannot release the recorded number", async () => {
    const { reserveNumberPurchase, startNumberPurchase, recordNumberPurchaseProvider } = await import("@/server/number-purchase-reservation.server");
    const reserved = await reserveNumberPurchase({ workspaceId, actorUserId: actor, phoneNumber: "+14165550001", accountSid: provider.accountSid });
    if (!reserved.ok) throw new Error("Fixture reservation required");
    await startNumberPurchase(reserved.purchase);
    await recordNumberPurchaseProvider(reserved.purchase, "PN00000000000000000000000000002084");
    provider.accountSid = "AC00000000000000000000000000009999";
    await expireReservations();
    const { runNumberPurchaseRecovery } = await import("@/lib/number-purchase-recovery.server");
    expect(await runNumberPurchaseRecovery()).toEqual({ examined: 1, cancelled: 0, pending: 1 });
    expect(provider.remove).not.toHaveBeenCalled();
    expect(await activeReservations()).toBe(1);
  });

});
