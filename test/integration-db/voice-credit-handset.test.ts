import { randomUUID } from "node:crypto";
import postgres from "postgres";
import twilio from "twilio";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import { withDataPlaneRouteArgs } from "../helpers/route-context-mock";

vi.hoisted(() => { process.env.TZ = "UTC"; process.env.BASE_URL = "https://handset-credit.example.test"; });
type ProviderCall = {
  sid: string; accountSid: string; to: string; from: string; direction: string; parentCallSid: string | null;
  status: string; duration: string | null; dateCreated: Date; dateUpdated: Date; endTime: Date | null;
  statusCallback?: string;
};
const provider = vi.hoisted(() => ({ accountSid: `AC${crypto.randomUUID().replaceAll("-", "")}`, fetch: vi.fn(), list: vi.fn(),
  events: vi.fn(), create: vi.fn(), records: new Map<string, ProviderCall>(),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  createWorkspaceTwilioInstance: async () => ({ accountSid: provider.accountSid,
    calls: Object.assign((sid: string) => ({ fetch: () => provider.fetch(sid), events: { list: () => provider.events(sid) } }),
      { create: provider.create, list: provider.list }),
  }),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(),
  emitPostgresChangeEvent: vi.fn(), emitQueueEvent: vi.fn(), emitPredictiveBroadcast: vi.fn(),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID(), otherActor = randomUUID();
const identity = `handset-${randomUUID()}`, otherIdentity = `handset-${randomUUID()}`;
const accountSid = provider.accountSid, to = "+16135550599", from = "+16135550501", token = "owned-handset-token";
const sid = () => `CA${randomUUID().replaceAll("-", "")}`;
let sql: postgres.Sql;
let service: typeof import("@/server/handset-voice-reservation.server");
let voice: typeof import("../../app/routes/api+/call.action.server");
let session: typeof import("../../app/routes/api+/workspaces+/$workspaceId/handset/session.action.server");

describe("funded handset SDK dispatch (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned database URL required");
    sql = postgres(url, { max: 3, onnotice: () => {} });
    await sql`insert into public."user" (id, username) values (${actor}::uuid, ${`handset-${actor}@example.test`}),
      (${otherActor}::uuid, ${`handset-${otherActor}@example.test`})`;
    await sql`insert into public.workspace (id, name, credits, twilio_data) values
      (${workspaceId}::uuid, 'Owned handset funding fixture', 100, ${sql.json({ sid: accountSid, authToken: token })}),
      (${foreignId}::uuid, 'Foreign handset control', 100, '{}'::jsonb)`;
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`handset:${workspaceId}:${actor}`}, ${workspaceId}, ${actor}, 'caller')`;
    await sql`insert into public.workspace_number (workspace, phone_number, type, capabilities, handset_enabled)
      values (${workspaceId}::uuid, ${from}, 'local', '{"voice":true}'::jsonb, true)`;
    await sql`insert into public.handset_session (id, workspace_id, user_id, client_identity, status, expires_at)
      values (${randomUUID()}::uuid, ${workspaceId}::uuid, ${actor}, ${identity}, 'active', now() + interval '1 hour'),
      (${randomUUID()}::uuid, ${foreignId}::uuid, ${otherActor}, ${otherIdentity}, 'active', now() + interval '1 hour')`;
    service = await import("@/server/handset-voice-reservation.server");
    voice = await import("../../app/routes/api+/call.action.server");
    session = await import("../../app/routes/api+/workspaces+/$workspaceId/handset/session.action.server");
  });
  beforeEach(async () => {
    vi.clearAllMocks(); provider.records.clear(); provider.accountSid = accountSid;
    provider.fetch.mockImplementation(async (id: string) => {
      const row = provider.records.get(id); if (!row) throw new Error("Owned provider call required"); return row;
    });
    provider.list.mockImplementation(async ({ parentCallSid }: { parentCallSid?: string }) =>
      [...provider.records.values()].filter((row) => row.parentCallSid === parentCallSid));
    provider.events.mockImplementation(async (id: string) => [{ request: { method: "POST",
      url: provider.records.get(id)?.statusCallback, parameters: { call_sid: id } } }]);
    const { resetRateLimitsForTests } = await import("@/lib/platform-rate-limit.server"); resetRateLimitsForTests();
    await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
    await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await sql`update public.workspace set credits = 100, disabled = false, archived_at = null where id = ${workspaceId}::uuid`;
    await sql`update public."user" set access_level = 'standard' where id = ${actor}::uuid`;
    await sql`update public.workspace_number set suspended_at = null where workspace = ${workspaceId}::uuid`;
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`handset:${workspaceId}:${actor}`}, ${workspaceId}, ${actor}, 'caller')
      on conflict (id) do update set role_id = 'caller'`;
    await sql`update public.handset_session set status = 'active', expires_at = now() + interval '1 hour'
      where workspace_id = ${workspaceId}::uuid`;
  });
  afterEach(async () => {
    const [foreign] = await sql`select credits from public.workspace where id = ${foreignId}::uuid`;
    expect(foreign.credits).toBe(100);
    expect(provider.create).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    try {
      if (sql) {
        await sql`delete from public.job where workspace_id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public."user" where id in (${actor}::uuid, ${otherActor}::uuid)`;
      }
    } finally {
      await sql?.end();
      if (service) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  const prepare = (overrides: Partial<Parameters<typeof service.prepareHandsetVoiceDial>[0]> = {}) =>
    service.prepareHandsetVoiceDial({ workspaceId, userId: actor, clientIdentity: identity, to, intentId: randomUUID(), ...overrides });
  async function reserve() {
    const result = await prepare(); if (!result.ok) throw new Error(`Handset preparation failed: ${result.reason}`); return result.reservation;
  }
  function root(overrides: Partial<ProviderCall> = {}): ProviderCall {
    const row = { sid: sid(), accountSid, to: "", from: `client:${identity}`, direction: "inbound", parentCallSid: null,
      status: "in-progress", duration: null, dateCreated: new Date(), dateUpdated: new Date(), endTime: null, ...overrides };
    provider.records.set(row.sid, row); return row;
  }
  async function state() {
    const [row] = await sql`select credits,
      (select count(*)::int from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid and state in ('reserved','creating','active')) as holds,
      (select count(*)::int from public.call where workspace = ${workspaceId}::uuid) as calls,
      (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger
      from public.workspace where id = ${workspaceId}::uuid`;
    return row;
  }
  async function signedVoice(reservationId: string, physical = root(), overrides: Record<string, string> = {}, validSignature = true) {
    const url = "https://handset-credit.example.test/api/call";
    const params = { workspace_id: workspaceId, client_identity: identity, credit_reservation: reservationId,
      To: to, From: `client:${identity}`, Direction: "inbound", AccountSid: accountSid, CallSid: physical.sid, ...overrides };
    const request = new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": validSignature ? twilio.getExpectedTwilioSignature(token, url, params) : "wrong" }, body: new URLSearchParams(params) });
    return asRouteResponse(voice.action(routeArgs(request)));
  }
  async function dial() {
    const reservation = await reserve(), physical = root();
    const response = await signedVoice(reservation.id, physical), xml = await response.text();
    expect(response.status).toBe(200); expect(xml).toContain(`<Number`); expect(xml).toContain(`>${to}</Number>`);
    const callback = xml.match(/<Number[^>]*statusCallback="([^"]+)"/);
    if (!callback) throw new Error("Funded recipient callback required");
    const child = root({ from, to, direction: "outbound-dial", parentCallSid: physical.sid,
      statusCallback: callback[1].replaceAll("&amp;", "&") });
    return { reservation, physical, child };
  }
  test("saves an SDK parent continuation with its one customer instruction", async () => {
    const { reservation } = await dial();
    const [row] = await sql`select setup_continuation_url from public.workspace_voice_reservation where id = ${reservation.id}::uuid`;
    expect(row.setup_continuation_url).toBe(`https://handset-credit.example.test/api/voice-continuation?credit_reservation=${reservation.id}`);
    expect(await state()).toMatchObject({ holds: 1, ledger: 0 });
  });
  test("a new SDK Dial returns control to its saved signed parent continuation", async () => {
    const reservation = await reserve(); const response = await signedVoice(reservation.id);
    expect(response.status).toBe(200); const xml = await response.text();
    const actionUrl = xml.match(/<Dial[^>]*\baction="([^"]+)"/)?.[1];
    if (!actionUrl) throw new Error("Saved parent action required");
    const url = new URL(actionUrl.replaceAll("&amp;", "&")); const overrides = new URLSearchParams(url.hash.slice(1)); url.hash = "";
    expect(url.href).toBe(`https://handset-credit.example.test/api/voice-continuation?credit_reservation=${reservation.id}`);
    expect(Object.fromEntries(overrides)).toEqual({ ct: "1000", rt: "3000", tt: "15000", rc: "2", rp: "ct,rt,5xx" });
    expect(xml).toMatch(/<Dial[^>]*\bmethod="POST"/);
    expect(await state()).toMatchObject({ holds: 1, ledger: 0 });
  });
  test("a new SDK Dial commits its recording nonce with the real inbound root", async () => {
    const reservation = await reserve(), physical = root(), response = await signedVoice(reservation.id, physical);
    const xml = await response.text(), callback = xml.match(/recordingStatusCallback="([^"]+)"/)?.[1];
    if (!callback) throw new Error("Owned SDK recording callback required");
    const url = new URL(callback.replaceAll("&amp;", "&")); expect(url.hash).not.toBe(""); url.hash = "";
    const [recording] = await sql`select id, state, send_started_at, source_call_sid, source_from, source_to, source_direction, callback_url
      from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    expect(recording).toMatchObject({ state: "creating", source_call_sid: physical.sid, source_from: `client:${identity}`,
      source_to: "", source_direction: "inbound", callback_url: `https://handset-credit.example.test/api/voice-recording?recording=${recording.id}` });
    expect(recording.send_started_at).not.toBeNull(); expect(url.href).toBe(recording.callback_url);
    expect(xml).toContain('recordingStatusCallbackEvent="in-progress completed absent"');
    expect(xml).toContain('recordingStatusCallbackMethod="POST"'); expect(await state()).toMatchObject({ holds: 1, ledger: 0 });
  });
  test("a recording checkpoint fault rolls back SDK customer permission and call persistence", async () => {
    const reservation = await reserve(), physical = root(), name = `owned_sdk_recording_${randomUUID().replaceAll("-", "")}`;
    await sql.unsafe(`create function public.${name}() returns trigger language plpgsql as $$begin
      if new.workspace = '${workspaceId}'::uuid and new.state = 'creating' then return null; end if; return new; end$$`);
    await sql.unsafe(`create trigger ${name} before update on public.workspace_voice_recording_operation for each row execute function public.${name}()`);
    try {
      expect(await (await signedVoice(reservation.id, physical)).text()).not.toContain("<Number");
      const [row] = await sql`select recipient_instruction_issued_at, setup_sid from public.workspace_voice_reservation where id = ${reservation.id}::uuid`;
      const [recording] = await sql`select state, send_started_at from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
      expect(row).toEqual({ recipient_instruction_issued_at: null, setup_sid: null });
      expect(recording).toEqual({ state: "prepared", send_started_at: null });
      expect(await state()).toEqual({ credits: 100, holds: 1, calls: 0, ledger: 0 });
    } finally {
      await sql.unsafe(`drop trigger if exists ${name} on public.workspace_voice_recording_operation`);
      await sql.unsafe(`drop function if exists public.${name}()`);
    }
    expect(await (await signedVoice(reservation.id, physical)).text()).toContain("<Number");
    expect(await state()).toEqual({ credits: 100, holds: 1, calls: 1, ledger: 0 });
  });
  test("an already issued SDK customer cannot acquire a missing continuation on retry", async () => {
    const { reservation, physical } = await dial();
    await sql`delete from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    await sql`update public.workspace_voice_reservation set setup_continuation_url = null where id = ${reservation.id}::uuid`;
    const response = await signedVoice(reservation.id, physical); expect(await response.text()).not.toContain("<Number");
    const [row] = await sql`select setup_continuation_url from public.workspace_voice_reservation where id = ${reservation.id}::uuid`;
    expect(row.setup_continuation_url).toBeNull(); expect(await state()).toMatchObject({ holds: 1, ledger: 0 });
    const recordings = await sql`select id from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    expect(recordings).toEqual([]);
  });
  test("ordinary SDK parent completion leaves its existing customer and hold unchanged", async () => {
    const { reservation, physical, child } = await dial();
    const [row] = await sql`select setup_continuation_url from public.workspace_voice_reservation where id = ${reservation.id}::uuid`;
    expect(row.setup_continuation_url).toBeTypeOf("string");
    const url: string = row.setup_continuation_url, before = await state();
    const params = { AccountSid: accountSid, CallSid: physical.sid, DialCallSid: child.sid, DialCallStatus: "completed",
      From: `client:${identity}`, To: to, Direction: "inbound" };
    const { action } = await import("../../app/routes/api+/voice-continuation.action.server");
    for (let retry = 0; retry < 3; retry++) {
      const request = new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": twilio.getExpectedTwilioSignature(token, url, params) }, body: new URLSearchParams(params) });
      const response = await asRouteResponse(action(routeArgs(request))); expect(response.status).toBe(200);
      expect(await response.text()).toContain("<Hangup");
    }
    expect(await state()).toEqual(before);
  });
  test.each([0, 1, 3])("refuses a handset call with %i credits before SDK dialing", async (credits) => {
    await sql`update public.workspace set credits = ${credits} where id = ${workspaceId}::uuid`;
    expect(await prepare()).toMatchObject({ ok: false, reason: "insufficient_credits" });
    expect(await state()).toEqual({ credits, holds: 0, calls: 0, ledger: 0 });
  });
  test("32 distinct intents compete for one affordable staffed hold", async () => {
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    const results = await Promise.all(Array.from({ length: 32 }, () => prepare()));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "insufficient_credits")).toHaveLength(31);
    expect(await state()).toEqual({ credits: 4, holds: 1, calls: 0, ledger: 0 });
  });
  test("retries reuse the same held intent before SDK acceptance", async () => {
    const intentId = randomUUID();
    const results = await Promise.all(Array.from({ length: 16 }, () => prepare({ intentId })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.flatMap((r) => r.ok ? [r.reservation.id] : []))).toHaveLength(1);
    expect(await state()).toEqual({ credits: 100, holds: 1, calls: 0, ledger: 0 });
    expect(await prepare({ intentId, to: "+16135550598" })).toMatchObject({ ok: false, reason: "dispatch_in_progress" });
  });
  test.each([
    { userId: otherActor }, { workspaceId: foreignId }, { clientIdentity: otherIdentity },
  ])("rejects foreign handset ownership %j", async (overrides) => {
    expect(await prepare(overrides)).toMatchObject({ ok: false, reason: "handset_not_found" });
    expect(await state()).toMatchObject({ holds: 0, calls: 0, ledger: 0 });
  });
  test.each(["ended", "expired", "membership", "disabled-user", "disabled-workspace", "suspended-caller"])("rechecks %s before preparation", async (change) => {
    if (change === "ended") await sql`update public.handset_session set status = 'ended' where client_identity = ${identity}`;
    if (change === "expired") await sql`update public.handset_session set expires_at = now() - interval '1 second' where client_identity = ${identity}`;
    if (change === "membership") await sql`delete from public.workspace_member where workspace_id = ${workspaceId} and user_id = ${actor}`;
    if (change === "disabled-user") await sql`update public."user" set access_level = 'disabled' where id = ${actor}::uuid`;
    if (change === "disabled-workspace") await sql`update public.workspace set disabled = true where id = ${workspaceId}::uuid`;
    if (change === "suspended-caller") await sql`update public.workspace_number set suspended_at = now() where workspace = ${workspaceId}::uuid`;
    expect(await prepare()).toMatchObject({ ok: false });
    expect(await state()).toMatchObject({ holds: 0, calls: 0, ledger: 0 });
  });
  test("session API reserves a caller's handset and rejects API-key context", async () => {
    const post = async (userId: string | null) => {
      const request = new Request(`https://handset-credit.example.test/api/workspaces/${workspaceId}/handset/session`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_identity: identity, to_number: to, dial_intent_id: randomUUID() }),
      });
      return asRouteResponse(session.action(await withDataPlaneRouteArgs(routeArgs(request, { workspaceId }), { workspaceId, userId })));
    };
    expect((await post(null)).status).toBe(401);
    const accepted = await post(actor); expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ reservation_id: expect.any(String), expires_at: expect.any(String) });
    await sql`update public.workspace set disabled = true where id = ${workspaceId}::uuid`;
    const disabled = await post(actor);
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toEqual({ error: "Workspace is not available for outbound calls" });
    expect(await state()).toEqual({ credits: 100, holds: 1, calls: 0, ledger: 0 });
  });
  test("one authenticated SDK root issues a recipient instruction once", async () => {
    const { reservation, physical } = await dial();
    const retry = await signedVoice(reservation.id, physical);
    expect(await retry.text()).not.toContain("<Number");
    const [saved] = await sql`select state, setup_sid, provider_sid, credits, recipient_instruction_issued_at,
      setup_client_identity from public.workspace_voice_reservation where id = ${reservation.id}::uuid`;
    expect(saved).toMatchObject({ state: "creating", setup_sid: physical.sid, provider_sid: null, credits: 4, setup_client_identity: identity });
    expect(saved.recipient_instruction_issued_at).not.toBeNull();
    expect(await state()).toEqual({ credits: 100, holds: 1, calls: 1, ledger: 0 });
  });
  test("concurrent signed SDK retries can issue only one customer leg", async () => {
    const reservation = await reserve(), physical = root();
    const results = await Promise.all(Array.from({ length: 16 }, () => signedVoice(reservation.id, physical)));
    const xml = await Promise.all(results.map((r) => r.text()));
    expect(xml.filter((text) => text.includes("<Number"))).toHaveLength(1);
    expect(await state()).toEqual({ credits: 100, holds: 1, calls: 1, ledger: 0 });
  });
  test.each([
    { from: "client:foreign" }, { to }, { accountSid: "AC00000000000000000000000000005880" },
    { parentCallSid: `CA${"1".repeat(32)}` }, { direction: "outbound-api" }, { status: "completed" },
  ])("signed custom parameters cannot hide physical root mismatch %j", async (overrides) => {
    const reservation = await reserve(), physical = root(overrides);
    const denied = await signedVoice(reservation.id, physical);
    expect(await denied.text()).not.toContain("<Number");
    expect(await state()).toEqual({ credits: 100, holds: 1, calls: 0, ledger: 0 });
  });
  test("rejects a bad provider signature before fetching root facts", async () => {
    const reservation = await reserve();
    expect((await signedVoice(reservation.id, root(), {}, false)).status).toBe(403);
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ calls: 0, ledger: 0 });
  });
  test("rejects a changed SDK owner and expired hold before instruction", async () => {
    const reservation = await reserve();
    await sql`update public.handset_session set status = 'ended' where client_identity = ${identity}`;
    expect(await (await signedVoice(reservation.id)).text()).not.toContain("<Number");
    await sql`update public.handset_session set status = 'active' where client_identity = ${identity}`;
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 second' where id = ${reservation.id}::uuid`;
    expect(await (await signedVoice(reservation.id)).text()).not.toContain("<Number");
    expect(await state()).toEqual({ credits: 100, holds: 1, calls: 0, ledger: 0 });
  });
  test.each([{ duration: "0", cost: 0 }, { duration: "42", cost: 4 }, { duration: "61", cost: 9 }])(
    "signed recipient completion at $duration seconds settles one customer charge", async ({ duration, cost }) => {
      const { physical, child } = await dial();
      const route = await import("../../app/routes/api+/call-status.action.server");
      const params = { AccountSid: accountSid, CallSid: child.sid, From: from, To: to, Direction: "outbound-dial",
        ParentCallSid: physical.sid, CallStatus: "completed", CallDuration: duration };
      const url = child.statusCallback;
      if (!url) throw new Error("Recipient callback required");
      for (let i = 0; i < 2; i++) {
        const request = new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
          "X-Twilio-Signature": twilio.getExpectedTwilioSignature(token, url, params) }, body: new URLSearchParams(params) });
        expect((await asRouteResponse(route.action(routeArgs(request)))).status).toBe(200);
        const { findCallBySid } = await import("@/lib/telephony-db.server");
        const { billTerminalCallStatus } = await import("@/lib/twilio-call-status.server");
        const saved = await findCallBySid(child.sid); if (!saved) throw new Error("Saved child required");
        await billTerminalCallStatus(saved);
      }
      expect(await state()).toEqual({ credits: 100 - cost, holds: 0, calls: 2, ledger: cost ? 1 : 0 });
      const setup = await sql`select * from public.transaction_history where workspace = ${workspaceId}::uuid and idempotency_key like ${`call:${physical.sid}%`}`;
      expect(setup).toHaveLength(0);
    },
  );
  test("abandoned preparation releases its hold without searching provider calls", async () => {
    await reserve();
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute' where workspace = ${workspaceId}::uuid`;
    const { runVoiceCreditRecovery } = await import("@/lib/voice-credit-recovery.server");
    expect(await runVoiceCreditRecovery()).toMatchObject({ examined: 1, released: 1, pending: 0 });
    expect(provider.fetch).not.toHaveBeenCalled(); expect(provider.list).not.toHaveBeenCalled();
    expect(await state()).toEqual({ credits: 100, holds: 0, calls: 0, ledger: 0 });
  });
  test("a failed instruction build keeps the preparation reusable", async () => {
    const reservation = await reserve(), physical = root();
    await expect(service.startPreparedHandsetVoiceRecipient({ workspaceId, clientIdentity: identity, reservationId: reservation.id,
      recipient: to, callSid: physical.sid, accountSid, from: `client:${identity}`, direction: "inbound",
      requestUrl: "https://handset-credit.example.test/api/call", statusCallback: "https://handset-credit.example.test/api/call-status",
    }, () => { throw new Error("Owned instruction failure"); })).rejects.toThrow("Owned instruction failure");
    expect(await state()).toEqual({ credits: 100, holds: 1, calls: 0, ledger: 0 });
    const [recording] = await sql`select state, send_started_at from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    expect(recording).toEqual({ state: "prepared", send_started_at: null });
    expect(await (await signedVoice(reservation.id, physical)).text()).toContain("<Number");
  });
  test("refuses a provider client on a different account", async () => {
    const reservation = await reserve(), physical = root();
    provider.accountSid = `AC${"2".repeat(32)}`;
    expect(await (await signedVoice(reservation.id, physical)).text()).not.toContain("<Number");
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ holds: 1, calls: 0 });
  });
  test("refuses a different Call SID returned by the provider", async () => {
    const reservation = await reserve(), physical = root();
    provider.fetch.mockResolvedValueOnce({ ...physical, sid: sid() });
    expect(await (await signedVoice(reservation.id, physical)).text()).not.toContain("<Number");
    expect(await state()).toMatchObject({ holds: 1, calls: 0 });
  });
  async function ageRecovery(physical: ProviderCall, child?: ProviderCall) {
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 minute'
      where workspace = ${workspaceId}::uuid`;
    physical.status = "completed"; physical.duration = "90";
    for (const row of [physical, ...(child ? [child] : [])]) {
      row.dateUpdated = new Date(Date.now() - 20 * 60_000); row.endTime = row.dateUpdated;
    }
  }
  test("a missing recipient after instruction does not release an uncertain hold", async () => {
    const { physical, child } = await dial(); provider.records.delete(child.sid);
    await ageRecovery(physical);
    const { runVoiceCreditRecovery } = await import("@/lib/voice-credit-recovery.server");
    expect(await runVoiceCreditRecovery()).toMatchObject({ examined: 1, pending: 1, released: 0, settled: 0 });
    expect(await state()).toEqual({ credits: 100, holds: 1, calls: 1, ledger: 0 });
  });
  test("recovery settles a missed recipient callback using its own request history", async () => {
    const { physical, child } = await dial(); child.status = "completed"; child.duration = "42";
    await ageRecovery(physical, child);
    const { runVoiceCreditRecovery } = await import("@/lib/voice-credit-recovery.server");
    expect(await runVoiceCreditRecovery()).toMatchObject({ examined: 1, settled: 1, pending: 0 });
    expect(await runVoiceCreditRecovery()).toMatchObject({ examined: 0 });
    expect(await state()).toEqual({ credits: 96, holds: 0, calls: 2, ledger: 1 });
    expect(provider.events).toHaveBeenCalledWith(child.sid);
  });
  test("SDK recovery cannot use unrelated recipient history", async () => {
    const { physical, child } = await dial(); child.status = "completed"; child.duration = "42";
    child.statusCallback = "https://handset-credit.example.test/api/call-status?credit_reservation=foreign";
    provider.events.mockImplementation(async (id: string) => [{ request: { method: "POST",
      url: id === physical.sid ? "https://handset-credit.example.test/api/call" : child.statusCallback,
      parameters: { call_sid: id },
    } }]);
    await ageRecovery(physical, child);
    const { runVoiceCreditRecovery } = await import("@/lib/voice-credit-recovery.server");
    expect(await runVoiceCreditRecovery()).toMatchObject({ examined: 1, pending: 1, settled: 0, released: 0 });
    expect(await state()).toEqual({ credits: 100, holds: 1, calls: 1, ledger: 0 });
  });
});
