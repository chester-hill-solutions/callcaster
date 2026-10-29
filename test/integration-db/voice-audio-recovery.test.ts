import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => { process.env.TZ = "UTC"; });
type Physical = {
  sid: string; accountSid: string; to: string; from: string; direction: string; parentCallSid: string | null;
  status: string; duration: string | null; dateCreated: Date; dateUpdated: Date; endTime: Date | null;
};
const provider = vi.hoisted(() => ({ accountSid: `AC${crypto.randomUUID().replaceAll("-", "")}`,
  fetch: vi.fn(), update: vi.fn(), list: vi.fn(), events: vi.fn(), create: vi.fn(),
  records: new Map<string, Physical>(), history: new Map<string, string>(),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  createWorkspaceTwilioInstance: async () => ({ accountSid: provider.accountSid,
    calls: Object.assign((sid: string) => ({ fetch: () => provider.fetch(sid), update: (args: { status: string }) => provider.update(sid, args),
      events: { list: () => provider.events(sid) } }), { create: provider.create, list: provider.list }),
  }),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(),
  emitPostgresChangeEvent: vi.fn(), emitQueueEvent: vi.fn(), emitPredictiveBroadcast: vi.fn(),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID(), otherActor = randomUUID();
const accountSid = provider.accountSid, phone = "+16135550801", from = "+16135550800";
const sid = () => `CA${randomUUID().replaceAll("-", "")}`;
const fault = `audio_status_${randomUUID().replaceAll("-", "")}`;
let sql: postgres.Sql;
let journal: typeof import("@/server/voice-audio-connection.server");
let lifecycle: typeof import("@/server/voice-audio-lifecycle.server");
let recovery: typeof import("@/lib/voice-audio-recovery.server");
type Connection = NonNullable<Awaited<ReturnType<typeof journal.findVoiceAudioConnection>>>;

describe("agent audio cancellation and original-account recovery (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned database URL required");
    sql = postgres(url, { max: 3, onnotice: () => {} });
    await sql`insert into public."user" (id, username) values (${actor}::uuid, ${`audio-recovery-${actor}@example.test`}),
      (${otherActor}::uuid, ${`audio-recovery-${otherActor}@example.test`})`;
    await sql`insert into public.workspace (id, name, credits, twilio_data) values
      (${workspaceId}::uuid, 'Owned audio recovery fixture', 100, ${sql.json({ sid: accountSid, authToken: "owned-audio-recovery-token" })}),
      (${foreignId}::uuid, 'Foreign audio recovery control', 100, '{}'::jsonb)`;
    await sql`insert into public.workspace_number (workspace, phone_number, type, capabilities, handset_enabled)
      values (${workspaceId}::uuid, ${from}, 'local', '{"voice":true}'::jsonb, true)`;
    journal = await import("@/server/voice-audio-connection.server");
    lifecycle = await import("@/server/voice-audio-lifecycle.server");
    recovery = await import("@/lib/voice-audio-recovery.server");
  });
  async function clearFault() {
    await sql.unsafe(`drop trigger if exists ${fault} on public.call`);
    await sql.unsafe(`drop function if exists public.${fault}()`);
  }
  function physical(id: string) {
    const row = provider.records.get(id);
    if (!row) throw new Error("Owned provider fixture call required");
    return row;
  }
  beforeEach(async () => {
    vi.clearAllMocks(); provider.records.clear(); provider.history.clear(); provider.accountSid = accountSid;
    provider.fetch.mockReset().mockImplementation(async (id: string) => physical(id));
    provider.list.mockReset().mockImplementation(async () => [...provider.records.values()]);
    provider.events.mockReset().mockImplementation(async (id: string) => [{ request: { method: "POST", url: provider.history.get(id), parameters: { call_sid: id } } }]);
    provider.update.mockReset().mockImplementation(async (id: string, args: { status: string }) => {
      const row = physical(id); row.status = args.status; row.endTime = new Date(); row.dateUpdated = new Date(); return row;
    });
    await clearFault();
    for (const table of ["workspace_voice_audio_connection", "call", "workspace_voice_reservation", "transaction_history"])
      await sql.unsafe(`delete from public.${table} where workspace = $1::uuid`, [workspaceId]);
    await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
    await sql`update public.workspace set credits = 100, archived_at = null, disabled = false,
      twilio_data = ${sql.json({ sid: accountSid, authToken: "owned-audio-recovery-token" })} where id = ${workspaceId}::uuid`;
    await sql`update public."user" set access_level = 'standard', verified_audio_numbers = ${sql.array([phone])} where id = ${actor}::uuid`;
    for (const id of [actor, otherActor]) await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`audio-recovery:${workspaceId}:${id}`}, ${workspaceId}, ${id}, 'caller') on conflict (id) do update set role_id = 'caller'`;
  });
  afterEach(async () => {
    await clearFault();
    expect(provider.create).not.toHaveBeenCalled();
    const [foreign] = await sql`select credits from public.workspace where id = ${foreignId}::uuid`;
    expect(foreign.credits).toBe(100);
    const [effects] = await sql`select
      (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger,
      (select count(*)::int from public.outreach_attempt where workspace = ${workspaceId}::uuid) as attempts,
      (select count(*)::int from public.campaign_queue where workspace = ${workspaceId}::uuid) as queue,
      (select count(*)::int from public.job where workspace_id = ${workspaceId}::uuid) as jobs`;
    expect(effects).toEqual({ ledger: 0, attempts: 0, queue: 0, jobs: 0 });
  });
  afterAll(async () => {
    try {
      if (sql) {
        await clearFault();
        await sql`delete from public.job where workspace_id = ${workspaceId}::uuid`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public."user" where id in (${actor}::uuid, ${otherActor}::uuid)`;
      }
    } finally {
      await sql?.end();
      if (journal) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  async function prepare() {
    const result = await journal.prepareVoiceAudioConnection({ workspaceId, userId: actor, intentId: randomUUID(), transport: "phone",
      phoneNumber: phone, baseUrl: "https://audio-recovery.example.test" });
    if (!result.ok) throw new Error(`Audio preparation refused: ${result.reason}`);
    return result.connection;
  }
  const owned = (row: Connection, userId = actor, workspace = workspaceId) => ({ workspaceId: workspace, userId, connectionId: row.id });
  async function started(accepted = true) {
    const result = await journal.claimVoiceAudioSend(await prepare());
    if (!result.ok) throw new Error(`Audio send claim refused: ${result.reason}`);
    const row = result.connection;
    const physical: Physical = { sid: sid(), accountSid, to: phone, from, direction: "outbound-api", parentCallSid: null,
      status: "ringing", duration: null, dateCreated: new Date(), dateUpdated: new Date(), endTime: null };
    provider.records.set(physical.sid, physical); provider.history.set(physical.sid, row.status_callback);
    return { row: accepted ? await journal.recordVoiceAudioProvider(row, physical.sid) : row, physical };
  }
  async function age(row: Connection) {
    await sql`update public.workspace_voice_audio_connection set lease_expires_at = now() - interval '1 minute' where id = ${row.id}::uuid`;
  }
  function finished(row: Physical, status = "completed") {
    row.status = status; row.duration = "42"; row.dateCreated = new Date(Date.now() - 21 * 60_000);
    row.dateUpdated = new Date(Date.now() - 20 * 60_000); row.endTime = row.dateUpdated;
  }
  async function ageUnknown(row: Connection, remote: Physical) {
    finished(remote);
    await sql`update public.workspace_voice_audio_connection set send_started_at = ${remote.dateCreated} where id = ${row.id}::uuid`;
    await age(row);
  }
  async function activate(row: Connection, live = false) {
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now(), joined_at = now(),
      conference_sid = ${`CF${randomUUID().replaceAll("-", "")}`}, target_kind = ${live ? "direct" : "idle"},
      requested_call_sid = ${live ? sid() : null}, original_agent_sid = ${live ? sid() : null},
      reservation_id = ${live ? randomUUID() : null} where id = ${row.id}::uuid`;
    const current = await journal.findVoiceAudioConnection(row.id);
    if (!current) throw new Error("Audio activation fixture required");
    return current;
  }

  test("reads only the current member's own operation", async () => {
    const row = await prepare();
    expect(await lifecycle.readOwnedVoiceAudioConnection(owned(row))).toMatchObject({ ok: true, connection: { id: row.id } });
    expect(await lifecycle.readOwnedVoiceAudioConnection(owned(row, otherActor))).toEqual({ ok: false, reason: "connection_not_found" });
    expect(await lifecycle.readOwnedVoiceAudioConnection(owned(row, actor, foreignId))).toEqual({ ok: false, reason: "agent_not_found" });
    expect(await lifecycle.cancelOwnedVoiceAudioConnection(owned(row, otherActor))).toEqual({ ok: false, reason: "connection_not_found" });
    expect((await journal.findVoiceAudioConnection(row.id))?.cancel_requested_at).toBeNull();
  });
  test.each(["disabled", "missing credentials"])("keeps read and cancellation available with %s workspace", async (kind) => {
    const row = await prepare();
    if (kind === "disabled") await sql`update public.workspace set disabled = true where id = ${workspaceId}::uuid`;
    else await sql`update public.workspace set twilio_data = '{}'::jsonb where id = ${workspaceId}::uuid`;
    expect(await lifecycle.readOwnedVoiceAudioConnection(owned(row))).toMatchObject({ ok: true });
    expect(await lifecycle.cancelOwnedVoiceAudioConnection(owned(row))).toMatchObject({ ok: true, connection: { state: "canceled" } });
  });
  test("a removed member cannot read or cancel an operation", async () => {
    const row = await prepare();
    await sql`delete from public.workspace_member where workspace_id = ${workspaceId} and user_id = ${actor}`;
    expect(await lifecycle.readOwnedVoiceAudioConnection(owned(row))).toEqual({ ok: false, reason: "agent_not_found" });
    expect(await lifecycle.cancelOwnedVoiceAudioConnection(owned(row))).toEqual({ ok: false, reason: "agent_not_found" });
  });
  test("cancels unsent preparation and fences a later send", async () => {
    const row = await prepare();
    expect(await lifecycle.cancelOwnedVoiceAudioConnection(owned(row))).toMatchObject({ ok: true, connection: { state: "canceled", send_started_at: null } });
    expect(await journal.claimVoiceAudioSend(row)).toEqual({ ok: false, reason: "connection_pending" });
    expect(await lifecycle.cancelOwnedVoiceAudioConnection(owned(row))).toMatchObject({ ok: true, connection: { state: "canceled" } });
  });
  test("does not mark an uncertain create canceled before it finds the real leg", async () => {
    const { row } = await started(false);
    expect(await lifecycle.cancelOwnedVoiceAudioConnection(owned(row))).toMatchObject({ ok: true, connection: { state: "creating", provider_sid: null } });
    await age(row);
    expect(await recovery.runVoiceAudioRecovery()).toEqual({ examined: 1, closed: 0, expired: 0, pending: 1 });
    expect(provider.update).not.toHaveBeenCalled();
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("creating");
  });
  test.each(["queued", "ringing", "in-progress"])("stops only the accepted %s audio leg after cancellation", async (status) => {
    const { row, physical } = await started(); physical.status = status;
    await lifecycle.cancelOwnedVoiceAudioConnection(owned(row)); await age(row);
    expect(await recovery.runVoiceAudioRecovery()).toEqual({ examined: 1, closed: 1, expired: 0, pending: 0 });
    expect(provider.update).toHaveBeenCalledExactlyOnceWith(physical.sid, { status: status === "in-progress" ? "completed" : "canceled" });
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ state: "canceled", provider_sid: physical.sid });
  });
  test("active customer audio cannot be ended by the transport cancellation control", async () => {
    const { row } = await started(); const active = await activate(row, true);
    expect(await lifecycle.cancelOwnedVoiceAudioConnection(owned(active))).toEqual({ ok: false, reason: "active_customer_audio" });
    expect((await journal.findVoiceAudioConnection(row.id))?.cancel_requested_at).toBeNull();
  });
  test("an adopted idle connection is protected by its funded conference", async () => {
    const { row } = await started(); await activate(row);
    await sql`insert into public.workspace_voice_reservation
      (id, workspace, kind, credits, account_sid, recipient, caller_id, conference_id, lease_token, lease_expires_at)
      values (${randomUUID()}::uuid, ${workspaceId}::uuid, 'staffed', 4, ${accountSid}, '+16135550899', ${from},
        ${row.conference_id}, ${randomUUID()}::uuid, now() + interval '5 minutes')`;
    expect(await lifecycle.cancelOwnedVoiceAudioConnection(owned(row))).toEqual({ ok: false, reason: "active_customer_audio" });
  });
  test("does not cancel across a saved, unfinished manual promotion", async () => {
    const { row } = await started();
    await sql`update public.workspace_voice_audio_connection set state = 'switching', promotion_requested_at = now() where id = ${row.id}::uuid`;
    expect(await lifecycle.cancelOwnedVoiceAudioConnection(owned(row))).toEqual({ ok: false, reason: "handoff_in_progress" });
    await age(row); expect(await recovery.runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1 });
    expect(provider.update).not.toHaveBeenCalled();
  });
  test("expires unsent preparation without contacting the provider", async () => {
    const row = await prepare(); await age(row);
    expect(await recovery.runVoiceAudioRecovery()).toEqual({ examined: 1, closed: 0, expired: 1, pending: 0 });
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("failed");
    expect(provider.fetch).not.toHaveBeenCalled(); expect(provider.list).not.toHaveBeenCalled();
  });
  test("concurrent recovery workers claim the operation once", async () => {
    const row = await prepare(); await age(row);
    const claims = await Promise.all(Array.from({ length: 4 }, () => lifecycle.claimVoiceAudioRecovery(1)));
    expect(claims.flat().map((r) => r.id)).toEqual([row.id]);
    expect(await lifecycle.expireUnsentVoiceAudio(row)).toBe(false);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("prepared");
  });
  test("an old recovery lease cannot stop a newly claimed operation", async () => {
    const { row } = await started(); await age(row); await lifecycle.claimVoiceAudioRecovery();
    expect(await lifecycle.claimVoiceAudioStop(row)).toBeNull();
    expect((await journal.findVoiceAudioConnection(row.id))?.cancel_requested_at).toBeNull();
  });
  test("keeps confirmed active audio while the owning agent remains a member", async () => {
    const { row, physical } = await started(); physical.status = "in-progress"; await activate(row); await age(row);
    expect(await recovery.runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1 });
    expect(provider.update).not.toHaveBeenCalled();
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("active");
  });
  test("stops an active agent leg after membership is revoked", async () => {
    const { row, physical } = await started(); physical.status = "in-progress"; await activate(row); await age(row);
    await sql`delete from public.workspace_member where workspace_id = ${workspaceId} and user_id = ${actor}`;
    expect(await recovery.runVoiceAudioRecovery()).toMatchObject({ examined: 1, closed: 1 });
    expect(provider.update).toHaveBeenCalledExactlyOnceWith(physical.sid, { status: "completed" });
  });
  test("a changed provider account cannot read, adopt or stop the original call", async () => {
    const { row } = await started(); await age(row); provider.accountSid = `AC${"9".repeat(32)}`;
    expect(await recovery.runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1 });
    expect(provider.fetch).not.toHaveBeenCalled(); expect(provider.list).not.toHaveBeenCalled(); expect(provider.update).not.toHaveBeenCalled();
    expect((await journal.findVoiceAudioConnection(row.id))?.terminal_at).toBeNull();
  });
  test("adopts an unknown terminal leg only with its exact saved callback history", async () => {
    const { row, physical } = await started(false); await ageUnknown(row, physical);
    expect(await recovery.runVoiceAudioRecovery()).toEqual({ examined: 1, closed: 1, expired: 0, pending: 0 });
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: physical.sid, terminal_status: "completed", state: "failed" });
    expect(provider.update).not.toHaveBeenCalled();
  });
  test("a bounded search with no calls does not prove an uncertain create was rejected", async () => {
    const { row } = await started(false); provider.records.clear(); await age(row);
    expect(await recovery.runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1, closed: 0, expired: 0 });
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("creating");
  });
  test.each(["callback URL", "account", "destination", "sender", "direction", "parent", "time", "history readiness"])(
    "does not adopt an unknown call with wrong %s", async (field) => {
      const { row, physical } = await started(false); await ageUnknown(row, physical);
      if (field === "callback URL") provider.history.set(physical.sid, "https://unrelated.example.test/api/call");
      if (field === "account") physical.accountSid = `AC${"0".repeat(32)}`;
      if (field === "destination") physical.to = "+16135550877";
      if (field === "sender") physical.from = "+16135550877";
      if (field === "direction") physical.direction = "outbound-dial";
      if (field === "parent") physical.parentCallSid = sid();
      if (field === "time") physical.dateCreated = new Date(Date.now() - 40 * 60_000);
      if (field === "history readiness") { physical.status = "in-progress"; physical.endTime = null; }
      expect(await recovery.runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1, closed: 0 });
      expect((await journal.findVoiceAudioConnection(row.id))?.provider_sid).toBeNull();
      expect(provider.update).not.toHaveBeenCalled();
    },
  );
  test("two proven candidates remain ambiguous", async () => {
    const { row, physical } = await started(false); await ageUnknown(row, physical);
    const other = { ...physical, sid: sid() }; provider.records.set(other.sid, other); provider.history.set(other.sid, row.status_callback);
    expect(await recovery.runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1 });
    expect((await journal.findVoiceAudioConnection(row.id))?.provider_sid).toBeNull();
  });
  test("an operator candidate cannot bypass the original callback evidence", async () => {
    const { row, physical } = await started(false); await ageUnknown(row, physical);
    provider.history.set(physical.sid, "https://unrelated.example.test/api/call");
    await expect(recovery.recoverVoiceAudioConnectionCall(row, physical.sid)).rejects.toThrow("does not prove");
    provider.history.set(physical.sid, row.status_callback);
    const saved = await journal.findVoiceAudioConnection(row.id); if (!saved) throw new Error("Saved audio operation required");
    expect(await recovery.recoverVoiceAudioConnectionCall(saved, physical.sid)).toBe(physical.sid);
  });
  test("terminal audio state and duration cannot regress on late progress or duplicate end", async () => {
    const { row } = await started();
    await lifecycle.observeVoiceAudioStatus(row, "completed", "42");
    await lifecycle.observeVoiceAudioStatus(row, "ringing", "999");
    await lifecycle.observeVoiceAudioStatus(row, "busy", "999");
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ state: "failed", terminal_status: "completed" });
    const [call] = await sql`select status, duration from public.call where sid = ${row.provider_sid}`;
    expect(call).toEqual({ status: "completed", duration: "42" });
  });
  test("a terminal status repair fault retains the journal and recovers without billing", async () => {
    const { row, physical } = await started(); finished(physical);
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin
      if new.workspace = '${workspaceId}'::uuid then raise exception 'owned audio status fault'; end if; return new; end $$`);
    await sql.unsafe(`create trigger ${fault} before update on public.call for each row execute function public.${fault}()`);
    await lifecycle.observeVoiceAudioStatus(row, "completed", "42");
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ terminal_status: "completed", last_error: "Agent audio status record needs recovery" });
    await clearFault(); await age(row);
    expect(await recovery.runVoiceAudioRecovery()).toMatchObject({ examined: 1, closed: 1 });
    expect((await journal.findVoiceAudioConnection(row.id))?.last_error).toBeNull();
    const [call] = await sql`select status, duration from public.call where sid = ${row.provider_sid}`;
    expect(call).toEqual({ status: "completed", duration: "42" });
    expect(await recovery.runVoiceAudioRecovery()).toEqual({ examined: 0, closed: 0, expired: 0, pending: 0 });
  });
});
