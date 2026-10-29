import { randomUUID } from "node:crypto";
import postgres from "postgres";
import twilio from "twilio";
import { RouterContextProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";

vi.hoisted(() => { process.env.TZ = "UTC"; process.env.BASE_URL = "https://voice-credit.example.test"; });
const provider = vi.hoisted(() => ({ accountSid: "AC00000000000000000000000000002879", create: vi.fn() }));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  createWorkspaceTwilioInstance: async () => ({ accountSid: provider.accountSid, calls: { create: provider.create } }),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(),
  emitPostgresChangeEvent: vi.fn(),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID();
const accountSid = provider.accountSid, fixtureToken = "owned-voice-fixture-token";
const recipient = "+16135550199", callerId = "+16135550100";
const faultName = `voice_fault_${randomUUID().replaceAll("-", "")}`;
let sql: postgres.Sql;
let campaignId: number;
let service: typeof import("@/lib/campaign-test-call.server");
let billing: typeof import("@/lib/twilio-call-status.server");
let holds: typeof import("@/server/voice-credit-reservation.server");
let callbacks: typeof import("@/server/voice-reservation-callback.server");
let numbers: typeof import("@/server/number-purchase-reservation.server");
const sid = () => `CA${randomUUID().replaceAll("-", "")}`;

describe("durable voice credit admission (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned database URL required");
    sql = postgres(url, { max: 3, onnotice: () => {} });
    await sql`insert into public."user" (id, username, created_at) values (${actor}::uuid, ${`voice-${actor}@example.test`}, now())`;
    await sql`insert into public.workspace (id, name, credits, twilio_data) values
      (${workspaceId}::uuid, 'Owned voice fixture', 2, ${sql.json({ sid: accountSid, authToken: fixtureToken })}),
      (${foreignId}::uuid, 'Foreign voice control', 2, '{}'::jsonb)`;
    const [script] = await sql`insert into public.script (name, workspace) values ('Owned voice script', ${workspaceId}::uuid) returning id`;
    const [campaign] = await sql`insert into public.campaign (title, workspace, type, caller_id, script_id)
      values ('Owned voice campaign', ${workspaceId}::uuid, 'simple_ivr', ${callerId}, ${script.id}) returning id`;
    campaignId = Number(campaign.id);
    service = await import("@/lib/campaign-test-call.server");
    billing = await import("@/lib/twilio-call-status.server");
    holds = await import("@/server/voice-credit-reservation.server");
    callbacks = await import("@/server/voice-reservation-callback.server");
    numbers = await import("@/server/number-purchase-reservation.server");
  });
  async function clearFault() {
    await sql.unsafe(`drop trigger if exists ${faultName} on public.workspace_voice_reservation`);
    await sql.unsafe(`drop function if exists public.${faultName}()`);
  }
  beforeEach(async () => {
    vi.clearAllMocks();
    provider.create.mockReset();
    provider.create.mockImplementation(async () => ({ sid: sid(), status: "queued" }));
    await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_number_purchase where workspace = ${workspaceId}::uuid`;
    await sql`update public.workspace set credits = 2 where id = ${workspaceId}::uuid`;
  });
  afterEach(async () => {
    await clearFault();
    const [foreign] = await sql`select credits from public.workspace where id = ${foreignId}::uuid`;
    expect(foreign.credits).toBe(2);
  });
  afterAll(async () => {
    try {
      if (sql) {
        await clearFault();
        await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
        await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
        await sql`delete from public.campaign where workspace = ${workspaceId}::uuid`;
        await sql`delete from public.script where workspace = ${workspaceId}::uuid`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public."user" where id = ${actor}::uuid`;
      }
    } finally {
      await sql?.end();
      if (service) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  const send = () => service.sendCampaignTestCall({ workspaceId, campaignId, userId: actor, to: recipient });
  const reserve = (kind: "ivr" | "staffed" = "ivr") => holds.reserveVoiceCredits({
    workspaceId, kind, accountSid, to: recipient, from: callerId, campaignId,
  });
  const urls = (id: string) => ({
    voiceUrl: `https://voice-credit.example.test/api/ivr/${campaignId}/?credit_reservation=${id}`,
    statusCallback: `https://voice-credit.example.test/api/ivr/status?credit_reservation=${id}`,
  });
  const start = (reservation: Parameters<typeof holds.startVoiceReservation>[0]) => holds.startVoiceReservation(reservation, urls(reservation.id));
  async function connected(kind: "ivr" | "staffed" = "ivr") {
    const result = await reserve(kind);
    if (!result.ok) throw new Error("Affordable fixture reservation required");
    const started = await start(result.reservation);
    const callSid = sid();
    await holds.recordVoiceReservationProvider(started, callSid);
    const [call] = await sql`select * from public.call where sid = ${callSid}`;
    return { reservation: started, call };
  }
  async function state() {
    const [row] = await sql`select credits,
      (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger,
      (select count(*)::int from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid and state in ('reserved','creating','active')) as active
      from public.workspace where id = ${workspaceId}::uuid`;
    return row;
  }
  test("one credit cannot start a two-credit IVR call", async () => {
    await sql`update public.workspace set credits = 1 where id = ${workspaceId}::uuid`;
    expect(await send()).toMatchObject({ ok: false, reason: "insufficient_credits" });
    expect(provider.create).not.toHaveBeenCalled();
    expect(await state()).toEqual({ credits: 1, ledger: 0, active: 0 });
  });
  test("fifty concurrent sends share one funded first minute", async () => {
    const results = await Promise.all(Array.from({ length: 50 }, send));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(provider.create).toHaveBeenCalledOnce();
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 1 });
  });
  test("completion and simultaneous duplicate callbacks debit once and free the hold", async () => {
    const sent = await send();
    if (!sent.ok) throw new Error("Affordable call required");
    const [call] = await sql`select * from public.call where sid = ${sent.callSid}`;
    await Promise.all(Array.from({ length: 10 }, () => billing.billTerminalCallStatus({ ...call, status: "completed", duration: "42" }, { campaignType: "simple_ivr" })));
    expect(await state()).toEqual({ credits: 0, ledger: 1, active: 0 });
    const [ledger] = await sql`select amount, idempotency_key from public.transaction_history where workspace = ${workspaceId}::uuid`;
    expect(ledger).toEqual({ amount: -2, idempotency_key: `call:${sent.callSid}` });
    const { emitTransactionHistoryInsertEvent } = await import("@/lib/workspace-events.server");
    expect(emitTransactionHistoryInsertEvent).toHaveBeenCalledOnce();
  });
  test("staffed admission holds four credits and retains later-minute grace", async () => {
    expect(await reserve("staffed")).toMatchObject({ ok: false, reason: "insufficient_credits" });
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    const { call } = await connected("staffed");
    expect(await reserve("staffed")).toMatchObject({ ok: false });
    await billing.billTerminalCallStatus({ ...call, status: "completed", duration: "61" });
    expect(await state()).toEqual({ credits: -5, ledger: 1, active: 0 });
    expect(await reserve("staffed")).toMatchObject({ ok: false });
  });
  test.each(["completed", "failed", "no-answer", "busy", "canceled"])("zero-duration %s frees funds without a debit", async (status) => {
    const { call } = await connected();
    await billing.billTerminalCallStatus({ ...call, status, duration: "0" });
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 0 });
    expect(await reserve()).toMatchObject({ ok: true });
  });
  test.each([400, 429])("definite rejection %s releases its hold and permits a new send", async (status) => {
    provider.create.mockRejectedValueOnce(Object.assign(new Error("Owned provider rejection"), { status }));
    expect(await send()).toMatchObject({ ok: false, reason: "call_failed" });
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 0 });
    expect(await send()).toMatchObject({ ok: true });
    expect(provider.create).toHaveBeenCalledTimes(2);
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 1 });
  });
  test.each([500, 408, undefined])("uncertain provider status %s is never retried and lease expiry does not free funds", async (status) => {
    provider.create.mockRejectedValue(Object.assign(new Error("Owned uncertain provider result"), { status }));
    expect(await send()).toMatchObject({ ok: false, reason: "call_failed" });
    expect(await send()).toMatchObject({ ok: false, reason: "insufficient_credits" });
    expect(provider.create).toHaveBeenCalledOnce();
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    const claimed = await holds.claimVoiceReservationRecovery();
    expect(claimed).toHaveLength(1);
    expect(claimed[0].send_started_at).not.toBeNull();
    expect(await reserve()).toMatchObject({ ok: false });
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 1 });
  });
  test("recovery fences a stale owner and can release an intent that never started", async () => {
    const result = await reserve();
    if (!result.ok) throw new Error("Fixture reservation required");
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute' where id = ${result.reservation.id}::uuid`;
    const [owner] = await holds.claimVoiceReservationRecovery();
    expect(owner.lease_token).not.toBe(result.reservation.lease_token);
    await expect(start(result.reservation)).rejects.toThrow("no longer owned");
    await expect(holds.recordVoiceReservationProvider(result.reservation, sid())).rejects.toThrow("no longer owned");
    await holds.releaseUnsentVoiceReservation(result.reservation, "not_sent");
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 1 });
    await holds.releaseUnsentVoiceReservation(owner, "not_sent");
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 0 });
  });
  test("a committed send checkpoint refuses a second provider attempt", async () => {
    const result = await reserve();
    if (!result.ok) throw new Error("Fixture reservation required");
    await start(result.reservation);
    await expect(start(result.reservation)).rejects.toThrow("no longer owned");
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 1 });
  });
  test("two recovery claimants cannot own the same expired intent", async () => {
    expect(await reserve()).toMatchObject({ ok: true });
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    const claims = await Promise.all([holds.claimVoiceReservationRecovery(), holds.claimVoiceReservationRecovery()]);
    expect(claims.flat()).toHaveLength(1);
  });
  test.each(["number", "voice"])("%s reservation first prevents the other from using the same funds", async (first) => {
    await sql`update public.workspace set credits = 100 where id = ${workspaceId}::uuid`;
    const purchase = () => numbers.reserveNumberPurchase({ workspaceId, actorUserId: actor, phoneNumber: "+16135550200", accountSid });
    const winner = first === "number" ? await purchase() : await reserve();
    expect(winner.ok).toBe(true);
    const loser = first === "number" ? await reserve() : await purchase();
    expect(loser.ok).toBe(false);
    expect(await state()).toMatchObject({ credits: 100, ledger: 0 });
  });
  test("concurrent number and voice reservations cannot commit the same funds", async () => {
    await sql`update public.workspace set credits = 100 where id = ${workspaceId}::uuid`;
    const results = await Promise.all([reserve(), numbers.reserveNumberPurchase({ workspaceId, actorUserId: actor, phoneNumber: "+16135550200", accountSid })]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });
  test("number finalization respects outstanding voice funds after another debit", async () => {
    await sql`update public.workspace set credits = 102 where id = ${workspaceId}::uuid`;
    expect(await reserve()).toMatchObject({ ok: true });
    const result = await numbers.reserveNumberPurchase({ workspaceId, actorUserId: actor, phoneNumber: "+16135550200", accountSid });
    if (!result.ok) throw new Error("Fixture number hold required");
    await numbers.startNumberPurchase(result.purchase);
    const providerSid = `PN${randomUUID().replaceAll("-", "")}`;
    await numbers.recordNumberPurchaseProvider(result.purchase, providerSid);
    await sql`update public.workspace set credits = 101 where id = ${workspaceId}::uuid`;
    const write = vi.fn();
    await expect(numbers.finalizeNumberPurchase(result.purchase, providerSid, "Owned fixture", write)).rejects.toThrow("Insufficient credits");
    expect(write).not.toHaveBeenCalled();
    expect(await state()).toEqual({ credits: 101, ledger: 0, active: 1 });
  });
  test("ledger insertion and hold settlement roll back together before any event", async () => {
    const { call } = await connected();
    await sql.unsafe(`create function public.${faultName}() returns trigger language plpgsql as $$ begin raise exception 'Owned voice settlement fault'; end $$`);
    await sql.unsafe(`create trigger ${faultName} before update on public.workspace_voice_reservation for each row when (new.workspace = '${workspaceId}'::uuid and new.state = 'settled') execute function public.${faultName}()`);
    await expect(billing.billTerminalCallStatus({ ...call, status: "completed", duration: "42" })).rejects.toThrow();
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 1 });
    const { emitTransactionHistoryInsertEvent } = await import("@/lib/workspace-events.server");
    expect(emitTransactionHistoryInsertEvent).not.toHaveBeenCalled();
    await clearFault();
    await billing.billTerminalCallStatus({ ...call, status: "completed", duration: "42" });
    expect(await state()).toEqual({ credits: 0, ledger: 1, active: 0 });
  });
  test("a pre-existing canonical debit still settles the hold without charging twice", async () => {
    const { call } = await connected();
    const { db } = await import("@/server/db");
    const { insertTransactionHistoryIdempotent } = await import("@/lib/transaction-history.server");
    await insertTransactionHistoryIdempotent(db, { workspaceId, type: "DEBIT", amount: -2, note: "Owned prior debit", idempotencyKey: `call:${call.sid}` });
    await billing.billTerminalCallStatus({ ...call, status: "completed", duration: "42" });
    expect(await state()).toEqual({ credits: 0, ledger: 1, active: 0 });
  });
  test("a legacy terminal call without a reservation retains its canonical debit", async () => {
    const { insertCallForWorkspace } = await import("@/lib/telephony-db.server");
    const call = await insertCallForWorkspace(workspaceId, { sid: sid(), campaign_id: campaignId, status: "completed", duration: "42" });
    if (!call) throw new Error("Legacy call fixture required");
    await billing.billTerminalCallStatus(call);
    await billing.billTerminalCallStatus(call);
    expect(await state()).toEqual({ credits: 0, ledger: 1, active: 0 });
  });
  test.each(["account", "recipient", "sid", "direction"])("callback with a different %s cannot bind another call", async (mismatch) => {
    const { reservation, call } = await connected();
    await expect(callbacks.bindVoiceReservationCallback({
      reservationId: reservation.id,
      callSid: mismatch === "sid" ? sid() : call.sid,
      accountSid: mismatch === "account" ? "AC00000000000000000000000000009999" : accountSid,
      to: mismatch === "recipient" ? "+16135550999" : recipient,
      direction: mismatch === "direction" ? "inbound" : "outbound-api",
      requestUrl: urls(reservation.id).statusCallback,
      entryPoint: "status",
    })).rejects.toThrow("does not match");
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 1 });
  });
  test("an altered callback query fails signature validation before binding", async () => {
    const { action } = await import("../../app/routes/api+/ivr/status.action.server");
    const result = await reserve();
    if (!result.ok) throw new Error("Fixture reservation required");
    await start(result.reservation);
    const url = `https://voice-credit.example.test/api/ivr/status?credit_reservation=${result.reservation.id}`;
    const params = { AccountSid: accountSid, CallSid: sid(), To: recipient, CallStatus: "completed", CallDuration: "42", Direction: "outbound-api" };
    const request = new Request(`${url}&tampered=true`, { method: "POST", headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": twilio.getExpectedTwilioSignature(fixtureToken, url, params),
    }, body: new URLSearchParams(params) });
    const response = await asRouteResponse(action({ ...routeArgs(request), context: new RouterContextProvider() }));
    expect(response.status).toBe(403);
    expect(await state()).toEqual({ credits: 2, ledger: 0, active: 1 });
    const [calls] = await sql`select count(*)::int as count from public.call where workspace = ${workspaceId}::uuid`;
    expect(calls.count).toBe(0);
  });
  test("a signed terminal callback before create returns preserves attribution and one debit", async () => {
    const { action } = await import("../../app/routes/api+/ivr/status.action.server");
    const callSid = sid();
    provider.create.mockImplementation(async ({ statusCallback }: { statusCallback: string }) => {
      const params = { AccountSid: accountSid, CallSid: callSid, To: recipient, From: callerId, Direction: "outbound-api", CallStatus: "completed", CallDuration: "42" };
      const request = new Request(statusCallback, { method: "POST", headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": twilio.getExpectedTwilioSignature(fixtureToken, statusCallback, params),
      }, body: new URLSearchParams(params) });
      const response = await asRouteResponse(action({ ...routeArgs(request), context: new RouterContextProvider() }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
      return { sid: callSid, status: "queued" };
    });
    expect(await send()).toMatchObject({ ok: true, callSid });
    const [call] = await sql`select status, campaign_id from public.call where sid = ${callSid}`;
    expect(call.status).toBe("completed");
    expect(Number(call.campaign_id)).toBe(campaignId);
    expect(await state()).toEqual({ credits: 0, ledger: 1, active: 0 });
  });
});
