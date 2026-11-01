import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => { process.env.TZ = "UTC"; });
vi.mock("@/lib/transactional-email.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transactional-email.server")>()),
  sendTransactionalEmail: vi.fn(async () => undefined),
}));
const provider = vi.hoisted(() => {
  const validationPhones: string[] = [];
  return { sid: "AC00000000000000000000000000002995", validationPhones, usageCalls: 0 };
});
vi.mock("twilio", async (importOriginal) => {
  const original = await importOriginal<typeof import("twilio")>();
  class OwnedClient {
    accountSid: string;
    constructor(accountSid: string, _token?: string, options?: { accountSid?: string }) {
      this.accountSid = options?.accountSid ?? accountSid;
    }
    usage = { records: { list: async () => { provider.usageCalls++; return []; } } };
    validationRequests = { create: async (args: { phoneNumber: string; friendlyName: string }) => {
      provider.validationPhones.push(args.phoneNumber);
      return { ...args, accountSid: this.accountSid, callSid: "CA00000000000000000000000000002995", validationCode: "123456" };
    } };
  }
  return { ...original, default: { ...original.default, Twilio: OwnedClient } };
});
const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspace = randomUUID(), foreign = randomUUID(), owner = randomUUID();
const phone = "+16135552995", releasedPhone = "+16135552996";
let sql: postgres.Sql;
let activeId: number, releasedId: number;
let closePools: () => Promise<void>;

async function liveIds(source: string) {
  const service = await import("@/lib/database/workspace.server");
  const admin = await import("@/lib/workspace-members-db.server");
  switch (source) {
    case "workspace numbers": return (await service.getWorkspacePhoneNumbers({ workspaceId: workspace })).data?.map(row => row.id);
    case "workspace overview": return (await service.getWorkspaceInfoWithDetails({ workspaceId: workspace, userId: owner })).phoneNumbers.map(row => row.id);
    case "admin workspace numbers": return (await admin.listWorkspaceNumbersForWorkspace(workspace)).map(row => row.id);
    case "admin global numbers": return (await admin.listAllWorkspaceNumbers()).filter(row => row.workspace === workspace).map(row => row.id);
    default: throw new Error("Unknown owned number reader");
  }
}

async function linkedHistory(queueId: number | null = null) {
  const [script] = await sql`insert into script (workspace, name, type, steps) values
    (${workspace}, 'Owned history menu', 'inbound_ivr', '{"pages":{"main":{"blocks":[]}},"blocks":{}}'::jsonb) returning id`;
  await sql`update workspace_number set inbound_script_id = ${script.id}, inbound_audio = 'owned-history.mp3' where id = ${activeId}`;
  const [history] = await sql`insert into workspace_number
    (workspace, type, phone_number, inbound_script_id, inbound_queue_id, inbound_audio, status, released_at)
    values (${workspace}, 'rented', '+16135553301', ${script.id}, ${queueId}, 'owned-history.mp3', 'released', '2026-10-01T12:00:00Z') returning id`;
  return { scriptId: Number(script.id), historyId: Number(history.id) };
}
async function providerCredentials() {
  await sql`update workspace set twilio_data = ${sql.json({ sid: provider.sid, authToken: 'owned-history-provider-token' })} where id = ${workspace}`;
  const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
  invalidateWorkspaceTwilioData(workspace);
}

describe.skipIf(!databaseUrl)("released numbers cannot reach live paths (#2995)", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Owned database required");
    vi.stubEnv("BASE_URL", "http://127.0.0.1:3038");
    vi.stubEnv("DATABASE_URL", databaseUrl); vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    sql = postgres(databaseUrl, { max: 1 });
    const { pool, directPool } = await import("@/server/db");
    closePools = async () => { await Promise.all([pool.end(), directPool.end()]); };
    await sql`insert into "user" (id, username) values (${owner}, ${`owned-history-${owner}@example.test`})`;
  });
  beforeEach(async () => {
    provider.validationPhones.length = 0; provider.usageCalls = 0;
    await sql`delete from "call" where workspace in (${workspace}, ${foreign})`;
    await sql`delete from message where workspace in (${workspace}, ${foreign})`;
    await sql`delete from workspace where id in (${workspace}, ${foreign})`;
    await sql`insert into workspace (id, name, credits, disabled) values
      (${workspace}, 'Owned number history', 100000, false), (${foreign}, 'Owned foreign history', 100000, false)`;
    await sql`insert into workspace_member (id, workspace_id, user_id, role_id)
      values (${randomUUID()}, ${workspace}, ${owner}, 'owner')`;
    const [old] = await sql`insert into workspace_number
      (workspace, type, phone_number, friendly_name, created_at, twilio_phone_number_sid, handset_enabled, status, released_at)
      values (${workspace}, 'rented', ${releasedPhone}, 'Released line', '2026-08-15T00:00:00Z',
      'PN00000000000000000000000000002996', true, 'released', '2026-10-01T12:00:00Z') returning id`;
    const [live] = await sql`insert into workspace_number
      (workspace, type, phone_number, friendly_name, created_at, twilio_phone_number_sid)
      values (${workspace}, 'rented', ${phone}, 'Active line', '2026-08-15T00:00:00Z',
      'PN00000000000000000000000000002995') returning id`;
    releasedId = Number(old.id); activeId = Number(live.id);
    await sql`insert into workspace_number (workspace, type, phone_number) values (${foreign}, 'rented', '+16135552997')`;
  });
  afterAll(async () => {
    try {
      if (sql) {
        await sql`delete from "call" where workspace in (${workspace}, ${foreign})`;
        await sql`delete from message where workspace in (${workspace}, ${foreign})`;
        await sql`delete from workspace where id in (${workspace}, ${foreign})`;
        await sql`delete from "user" where id = ${owner}`;
      }
    } finally { await closePools?.(); await sql?.end(); vi.unstubAllEnvs(); }
  });

  async function chatArgs(request: Request) {
    const { RouterContextProvider } = await import("react-router");
    const { workspaceContext } = await import("@/lib/route-context.server");
    const { createTenantDb } = await import("@/server/tenant-db");
    const context = new RouterContextProvider();
    context.set(workspaceContext, { workspaceId: workspace, userId: owner, userRole: "owner",
      headers: new Headers(), tdb: createTenantDb(workspace) });
    return { request, url: new URL(request.url), params: { id: workspace }, context };
  }
  test("Chats lists only active senders through its real loader", async () => {
    const { loader } = await import("../../app/routes/workspaces+/$id/chats.loader.server");
    const { asRouteResponse } = await import("../helpers/route-result");
    const response = await asRouteResponse(loader(await chatArgs(new Request(`http://localhost/workspaces/${workspace}/chats`))));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.workspaceNumbers.map((row: { id: number }) => row.id)).toEqual([activeId]);
  });
  test("Chats rejects a released sender before recipient or provider work", async () => {
    const remote = "+16135553111";
    await sql`insert into contact (workspace, phone, opt_out) values (${workspace}, ${remote}, true)`;
    const { action } = await import("../../app/routes/workspaces+/$id/chats.action.server");
    const { asRouteResponse } = await import("../helpers/route-result");
    async function send(from: string) {
      const body = new URLSearchParams({ from, contact_number: remote, body: "Owned sender test" });
      return asRouteResponse(action(await chatArgs(new Request(`http://localhost/workspaces/${workspace}/chats`, { method: "POST", body }))));
    }
    // The active control reaches the real opt-out guard, so it makes no provider call.
    const live = await send(phone);
    expect(live.status).toBe(403);
    expect(await live.json()).toMatchObject({ optedOut: true });
    const retired = await send(releasedPhone);
    expect(retired.status).toBe(400);
    expect(await retired.json()).toMatchObject({ error: "from must be a rented phone number that belongs to this workspace" });
  });
  test.each(["workspace numbers", "workspace overview", "admin workspace numbers", "admin global numbers"])(
    "%s excludes a released row and keeps the active row", async (source) => {
      expect(await liveIds(source)).toEqual([activeId]);
    },
  );
  test("handset selection skips a released handset and falls back to the active number", async () => {
    const { getHandsetNumberForWorkspace } = await import("@/lib/database/workspace.server");
    expect((await getHandsetNumberForWorkspace({ workspaceId: workspace })).data?.id).toBe(activeId);
  });
  test("outbound caller ID refuses the released number", async () => {
    const { resolveCallerIdUsability } = await import("@/lib/caller-id-usability.server");
    expect(await resolveCallerIdUsability(workspace, phone)).toEqual({ kind: "ok" });
    expect(await resolveCallerIdUsability(workspace, releasedPhone)).toMatchObject({ kind: "not_owned" });
  });
  test.each(["voice", "voice fallback", "voicemail"])("inbound %s cannot route through a released number", async (path) => {
    const service = await import("@/lib/inbound-call-db.server");
    const lookup = path === "voice" ? service.findWorkspaceNumberByPhoneNumber
      : path === "voice fallback" ? service.findWorkspaceNumberInboundFallbackByPhone
      : (value: string) => service.findWorkspaceNumberVoicemailContextByPhone(value, workspace);
    expect(await lookup(phone)).not.toBeNull();
    expect(await lookup(releasedPhone)).toBeNull();
  });
  test("webhook credentials exclude the released number", async () => {
    const { listWorkspaceNumberTwilioCandidatesByPhone } = await import("@/lib/inbound-call-db.server");
    expect(await listWorkspaceNumberTwilioCandidatesByPhone(phone)).toHaveLength(1);
    expect(await listWorkspaceNumberTwilioCandidatesByPhone(releasedPhone)).toEqual([]);
  });
  test("inbound SMS cannot find a workspace through its released number", async () => {
    const { resolveInboundWorkspaceContext } = await import("@/lib/inbound-sms-context.server");
    expect((await resolveInboundWorkspaceContext({ toRaw: phone, messagingServiceSid: "" })).ok).toBe(true);
    expect((await resolveInboundWorkspaceContext({ toRaw: releasedPhone, messagingServiceSid: "" })).ok).toBe(false);
  });
  test("rental billing charges the active control and never charges released history", async () => {
    const { runNumberRentalBilling } = await import("@/lib/number-rental-billing.server");
    const result = await runNumberRentalBilling({ workspaceId: workspace, today: new Date("2026-10-15T00:00:00Z") });
    expect(result.processed).toBe(1);
    expect(result.charged).toBeGreaterThan(0);
    const { numberRentalCycleKey } = await import("../../shared/billing-keys");
    const rows = await sql`select idempotency_key from transaction_history where workspace = ${workspace}`;
    expect(rows.some(row => row.idempotency_key?.startsWith(numberRentalCycleKey(activeId, "")))).toBe(true);
    expect(rows.some(row => row.idempotency_key?.startsWith(numberRentalCycleKey(releasedId, "")))).toBe(false);
  });
  test("number settings cannot edit a released row", async () => {
    const { updateWorkspacePhoneNumber } = await import("@/lib/database/workspace.server");
    expect((await updateWorkspacePhoneNumber({ workspaceId: workspace, numberId: activeId, updates: { friendly_name: "Active edited" } })).data?.friendly_name).toBe("Active edited");
    expect((await updateWorkspacePhoneNumber({ workspaceId: workspace, numberId: releasedId, updates: { friendly_name: "Must not change" } })).data).toBeNull();
    const [row] = await sql`select friendly_name from workspace_number where id = ${releasedId}`;
    expect(row.friendly_name).toBe("Released line");
  });
  test("a stale database writer cannot reactivate the retained row", async () => {
    const changed = await sql`update workspace_number set status = 'active', released_at = null where id = ${releasedId} returning id`;
    expect(changed).toHaveLength(0);
    const [row] = await sql`select status, released_at from workspace_number where id = ${releasedId}`;
    expect(row.status).toBe("released");
    expect(row.released_at).not.toBeNull();
  });
  test("history uses retained rows and completed legacy receipts without duplicates", async () => {
    const { getWorkspaceNumberHistory } = await import("@/lib/workspace-number-history.server");
    const [old] = await sql`select created_at from workspace_number where id = ${releasedId}`;
    await sql`insert into workspace_number_release
      (id, workspace, number_id, number_created_at, number_type, phone_number, friendly_name, account_sid, state, lease_token, lease_expires_at, updated_at)
      values (${randomUUID()}, ${workspace}, ${releasedId}, ${old.created_at.toISOString()}, 'rented', ${releasedPhone}, 'Released line',
      'AC00000000000000000000000000002995', 'completed', ${randomUUID()}, now(), '2026-10-01T12:00:00Z'),
      (${randomUUID()}, ${workspace}, 9007199254740900, '2026-08-01T00:00:00Z', 'rented', '+16135552998', 'Legacy line',
      'AC00000000000000000000000000002995', 'completed', ${randomUUID()}, now(), '2026-09-01T12:00:00Z')`;
    const history = await getWorkspaceNumberHistory({ workspaceId: workspace });
    expect(history).toHaveLength(2);
    expect(history.map(row => row.phone_number)).toEqual([releasedPhone, '+16135552998']);
    expect(history.map(row => new Date(row.released_at).toISOString())).toEqual(['2026-10-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z']);
    expect(await getWorkspaceNumberHistory({ workspaceId: foreign })).toEqual([]);
  });
  test("archive skips released history and preserves its date", async () => {
    await sql`delete from workspace_number where id = ${activeId}`;
    const { archiveWorkspace } = await import("@/lib/workspace-archive.server");
    expect(await archiveWorkspace(workspace)).toMatchObject({ ok: true, releasedNumbers: 0 });
    const [row] = await sql`select status, released_at from workspace_number where id = ${releasedId}`;
    expect(row.status).toBe('released');
    expect(row.released_at.toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });
  test("Twilio prune evidence excludes released numbers from counts and SID references", async () => {
    const { readDatabaseEvidence } = await import("../../scripts/lib/twilio-prune-database-evidence.mjs");
    const evidence = await readDatabaseEvidence({ databaseUrl, activeWindowDays: 30 });
    expect(evidence.accounts.find((row: { id: string }) => row.id === workspace)).toMatchObject({ numbersTotal: 1, rented: 1 });
    expect(evidence.numberSids.has('PN00000000000000000000000000002995')).toBe(true);
    expect(evidence.numberSids.has('PN00000000000000000000000000002996')).toBe(false);
  });
  test("the cull report CLI lists only live numbers", async () => {
    const result = spawnSync(process.execPath, ['scripts/cull-report.mjs', '--json'], {
      encoding: 'utf8', timeout: 15000,
      env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl, DATABASE_DIRECT_URL: databaseUrl, DATABASE_PUBLIC_URL: '', NODE_ENV: 'test', TZ: 'UTC' },
    });
    expect(result.status, result.stderr).toBe(0);
    const data = JSON.parse(result.stdout);
    const row = data.report.find((entry: { id: string }) => entry.id === workspace);
    expect(row.numbers_total).toBe(1);
    expect(row.numbers.map((number: { phone_number: string }) => number.phone_number)).toEqual([phone]);
  });
  test("diagnostics and provider sync use the live local inventory", async () => {
    const { listLiveWorkspaceNumbers } = await import("../../scripts/lib/live-workspace-numbers.mjs");
    expect((await listLiveWorkspaceNumbers(sql, workspace)).map((row: { phone_number: string }) => row.phone_number)).toEqual([phone]);
    const result = spawnSync(process.execPath, ['scripts/local/doctor.mjs', workspace, '--json'], {
      encoding: 'utf8', timeout: 15000,
      env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl, DATABASE_DIRECT_URL: databaseUrl, DATABASE_PUBLIC_URL: '', NODE_ENV: 'test', TZ: 'UTC' },
    });
    expect([0, 1]).toContain(result.status);
    expect(JSON.parse(result.stdout).numbers.map((row: { number: string }) => row.number)).toEqual([phone]);
  });

  test("retained workspace identities cannot become phantom message partners", async () => {
    const remote = '+16135553111';
    await sql`insert into message (sid, workspace, "from", "to", direction, status, date_created)
      values (${randomUUID()}, ${workspace}, ${remote}, ${releasedPhone}, 'inbound', 'received', '2026-09-15T12:00:00Z'),
      (${randomUUID()}, ${workspace}, ${releasedPhone}, null, 'inbound', 'received', '2026-09-15T12:01:00Z')`;
    const { fetchConversationSummary, readWorkspaceUnreadConversationCount } = await import("@/lib/database/workspace-conversations.server");
    const summary = await fetchConversationSummary(workspace, null, { enrichContacts: false });
    expect(summary.chatsError).toBeNull();
    expect(summary.chats.map(row => row.contact_phone)).toEqual([remote]);
    expect(await readWorkspaceUnreadConversationCount(workspace)).toBe(1);
  });
  test("past call attribution survives while call-log number choices stay live", async () => {
    const sid = randomUUID(), remote = '+16135553111';
    await sql`insert into "call" (sid, workspace, "from", "to", direction, status)
      values (${sid}, ${workspace}, ${releasedPhone}, ${remote}, 'outbound-api', 'completed')`;
    const { loadCallLogPage } = await import("@/lib/call-log.server");
    const page = await loadCallLogPage({ workspaceId: workspace, requestUrl: `https://fixture.example/workspaces/${workspace}/calls` });
    expect(page.workspaceNumbers.map(row => row.id)).toEqual([activeId]);
    expect(page.rows.find(row => row.sid === sid)).toMatchObject({ callcasterNumber: releasedPhone, otherNumber: remote, direction: 'outbound' });
  });
  test("support can read archived workspace history without restoring access", async () => {
    await sql`update workspace set archived_at = now() where id = ${workspace}`;
    const { getAdminWorkspaceDetail } = await import("@/lib/platform-admin.server");
    const result = await getAdminWorkspaceDetail(workspace);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Owned admin fixture missing');
    expect(result.phoneNumbers.map(row => row.id)).toEqual([activeId]);
    expect(result.numberHistory).toEqual([expect.objectContaining({ number_id: releasedId, phone_number: releasedPhone })]);
    const [row] = await sql`select archived_at from workspace where id = ${workspace}`;
    expect(row.archived_at).not.toBeNull();
  });

  test("workspace and API number lists expose only the active lifecycle", async () => {
    const { fetchWorkspaceData } = await import("@/lib/database/workspace.server");
    const data = await fetchWorkspaceData(workspace);
    expect(data.workspaceError).toBeNull();
    expect(data.workspace?.workspace_number.map(row => row.id)).toEqual([activeId]);
    const { listWorkspaceNumbers } = await import("@/lib/platform-workspace-numbers.server");
    const response = await listWorkspaceNumbers(owner, workspace);
    expect(response).toMatchObject({ ok: true, numbers: [expect.objectContaining({ id: activeId, status: 'active', released_at: null })] });
    if (response.ok) expect(response.numbers).toHaveLength(1);
  });
  test("queue settings offer only live workspace numbers", async () => {
    const { loadInboundQueueSettings } = await import("@/lib/inbound-queue-db.server");
    expect((await loadInboundQueueSettings(workspace)).numbers.map(row => row.id)).toEqual([activeId]);
  });
  test("portal readiness does not treat retained history as a live number", async () => {
    const { getWorkspaceTwilioPortalSnapshot } = await import("@/lib/database/workspace-twilio-portal-snapshot.server");
    expect((await getWorkspaceTwilioPortalSnapshot({ workspaceId: workspace })).readiness.legacyMode).toBe(true);
    await sql`delete from workspace_number where id = ${activeId}`;
    expect((await getWorkspaceTwilioPortalSnapshot({ workspaceId: workspace })).readiness.legacyMode).toBe(false);
  });
  test("campaign creation refuses a released caller ID before campaign or provider work", async () => {
    const { validateCreateWithScriptPreflight } = await import("@/lib/create-with-script.server");
    expect(await validateCreateWithScriptPreflight({ workspaceId: workspace, callerId: phone, audienceIds: [] })).toEqual({ ok: true });
    expect(await validateCreateWithScriptPreflight({ workspaceId: workspace, callerId: releasedPhone, audienceIds: [] })).toMatchObject({ ok: false, status: 400 });
  });
  test("routing edits and forwarding destinations cannot use released numbers", async () => {
    const { createTenantDb } = await import("@/server/tenant-db");
    const { applyRoutingPresetWithTenantDb } = await import("@/lib/routing-preset-write.server");
    const tdb = createTenantDb(workspace);
    expect(await applyRoutingPresetWithTenantDb(tdb, String(activeId), { presetId: 'webhook_only' }, workspace)).toMatchObject({ ok: true });
    expect(await applyRoutingPresetWithTenantDb(tdb, String(releasedId), { presetId: 'webhook_only' }, workspace)).toMatchObject({ ok: false, status: 404 });
    const verified = '+16135553201', retired = '+16135553202';
    await sql`insert into workspace_number (workspace, type, phone_number, capabilities, status, released_at)
      values (${workspace}, 'caller_id', ${verified}, '{"verification_status":"success"}'::jsonb, 'active', null),
      (${workspace}, 'caller_id', ${retired}, '{"verification_status":"success"}'::jsonb, 'released', '2026-10-01T12:00:00Z')`;
    expect(await applyRoutingPresetWithTenantDb(tdb, String(activeId), { presetId: 'forward', phoneNumber: verified }, workspace)).toMatchObject({ ok: true });
    expect(await applyRoutingPresetWithTenantDb(tdb, String(activeId), { presetId: 'forward', phoneNumber: retired }, workspace)).toMatchObject({ ok: false, status: 400 });
  });
  test("script usage and validation ignore historical number attachments", async () => {
    const { scriptId } = await linkedHistory();
    const { getScriptUsage } = await import("@/lib/script-persistence.server");
    const { validateAttachedInboundScriptUpdate } = await import("@/server/inbound-script-write.server");
    const { createTenantDb } = await import("@/server/tenant-db");
    expect(await getScriptUsage({ workspaceId: workspace, scriptId })).toMatchObject({ inboundNumberCount: 1 });
    await expect(validateAttachedInboundScriptUpdate(createTenantDb(workspace), scriptId, { type: 'script', steps: {} })).rejects.toThrow(/inbound IVR/);
    await sql`update workspace_number set inbound_script_id = null where id = ${activeId}`;
    expect(await getScriptUsage({ workspaceId: workspace, scriptId })).toMatchObject({ inboundNumberCount: 0 });
    await expect(validateAttachedInboundScriptUpdate(createTenantDb(workspace), scriptId, { type: 'script', steps: {} })).resolves.toBeUndefined();
  });
  test("released audio references cannot block editing live workspace media", async () => {
    await linkedHistory();
    const { findAudioUsage } = await import("@/lib/database/audio-usage.server");
    expect(await findAudioUsage(workspace, 'owned-history.mp3')).toEqual([expect.objectContaining({ kind: 'number_inbound', phoneNumber: phone })]);
    await sql`update workspace_number set inbound_audio = null where id = ${activeId}`;
    expect(await findAudioUsage(workspace, 'owned-history.mp3')).toEqual([]);
  });
  test("IVR page and block lookups refuse a released attachment", async () => {
    const linked = await linkedHistory();
    const { loadInboundIvrPageContext, loadInboundIvrBlockContext } = await import("@/lib/inbound-ivr-db.server");
    expect(await loadInboundIvrPageContext(activeId)).not.toBeNull();
    expect(await loadInboundIvrPageContext(linked.historyId)).toBeNull();
    expect(await loadInboundIvrBlockContext(activeId)).not.toBeNull();
    expect(await loadInboundIvrBlockContext(linked.historyId)).toBeNull();
  });
  test("verification callbacks cannot edit historical capabilities", async () => {
    const { updateWorkspaceNumberCapabilitiesByPhone } = await import("@/lib/inbound-call-db.server");
    await updateWorkspaceNumberCapabilitiesByPhone(phone, { voice: true }, workspace);
    await updateWorkspaceNumberCapabilitiesByPhone(releasedPhone, { voice: true }, workspace);
    const rows = await sql`select id, capabilities from workspace_number where workspace = ${workspace} order by id`;
    expect(rows.find(row => Number(row.id) === activeId)?.capabilities).toEqual({ voice: true });
    expect(rows.find(row => Number(row.id) === releasedId)?.capabilities).toBeNull();
  });
  test("a number assigned to another workspace no longer routes to its historical owner", async () => {
    await sql`insert into workspace_number (workspace, type, phone_number) values (${foreign}, 'rented', ${releasedPhone})`;
    const { findWorkspaceNumberByPhoneNumber } = await import("@/lib/inbound-call-db.server");
    const { resolveInboundWorkspaceContext } = await import("@/lib/inbound-sms-context.server");
    const { resolveCallerIdUsability } = await import("@/lib/caller-id-usability.server");
    expect(await findWorkspaceNumberByPhoneNumber(releasedPhone)).toMatchObject({ workspaceId: foreign });
    expect(await resolveInboundWorkspaceContext({ toRaw: releasedPhone, messagingServiceSid: '' })).toMatchObject({ ok: true, ctx: { workspace: foreign } });
    expect(await resolveCallerIdUsability(workspace, releasedPhone)).toMatchObject({ kind: 'not_owned' });
    expect(await resolveCallerIdUsability(foreign, releasedPhone)).toEqual({ kind: 'ok' });
  });
  test("rental reconciliation separates live inventory from release receipts", async () => {
    await providerCredentials();
    const { loadNumberRentalReconciliationInput } = await import("@/lib/number-rental-reconciliation.server");
    const report = await loadNumberRentalReconciliationInput({ workspaceId: workspace, referenceDate: new Date('2026-10-31T12:00:00Z') });
    expect(report.history.map(row => row.id)).toEqual([activeId]);
    expect(provider.usageCalls).toBe(1);
  });
  test("new caller-ID verification creates a new row and preserves the retired row", async () => {
    await providerCredentials();
    const { startWorkspaceCallerIdVerification } = await import("@/lib/caller-id-verification.server");
    const result = await startWorkspaceCallerIdVerification({ workspaceId: workspace, phoneNumber: releasedPhone, friendlyName: 'New verification' });
    expect(result.numberRequest[0]?.id).not.toBe(releasedId);
    expect(provider.validationPhones).toEqual([releasedPhone]);
    const rows = await sql`select status, released_at from workspace_number where workspace = ${workspace} and phone_number = ${releasedPhone} order by id`;
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('released');
    expect(rows[0].released_at.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(rows[1]).toEqual({ status: 'active', released_at: null });
  });
  test("a later rental gets a new row and one debit; duplicate requests are refused", async () => {
    const purchase = await import("@/server/number-purchase-reservation.server");
    const { createTenantDb } = await import("@/server/tenant-db");
    const { NUMBER_RENTAL_MONTHLY_CREDITS } = await import("@/lib/number-rental");
    const reserved = await purchase.reserveNumberPurchase({ workspaceId: workspace, actorUserId: owner, phoneNumber: releasedPhone, accountSid: provider.sid });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) throw new Error('Owned rental reservation missing');
    await purchase.startNumberPurchase(reserved.purchase);
    const providerSid = 'PN00000000000000000000000000003000';
    await purchase.recordNumberPurchaseProvider(reserved.purchase, providerSid);
    const fresh = await purchase.finalizeNumberPurchase(reserved.purchase, providerSid, 'Owned later rental', async tx => {
      const [row] = await createTenantDb(workspace, tx).workspace_number.insert({ type: 'rented', phone_number: releasedPhone, twilio_phone_number_sid: providerSid });
      if (!row) throw new Error('Owned rental row missing');
      return row;
    });
    expect(fresh.id).not.toBe(releasedId);
    expect(fresh.status).toBe('active');
    expect(await purchase.reserveNumberPurchase({ workspaceId: workspace, actorUserId: owner, phoneNumber: releasedPhone, accountSid: provider.sid })).toMatchObject({ ok: false, status: 409 });
    const [balance] = await sql`select credits from workspace where id = ${workspace}`;
    expect(balance.credits).toBe(100000 - NUMBER_RENTAL_MONTHLY_CREDITS);
    expect(await sql`select id from transaction_history where workspace = ${workspace}`).toHaveLength(1);
    const [old] = await sql`select status, released_at from workspace_number where id = ${releasedId}`;
    expect(old.status).toBe('released');
    expect(old.released_at.toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });

  test("read-only history preserves database cleanup of deleted script and queue references", async () => {
    const { createTenantDb } = await import("@/server/tenant-db");
    const [queue] = await createTenantDb(workspace).inbound_queue.insert({ name: 'Owned history queue' });
    if (!queue) throw new Error('Owned history queue missing');
    const linked = await linkedHistory(queue.id);
    await sql`update workspace_number set inbound_script_id = null where id = ${activeId}`;
    await sql`delete from script where id = ${linked.scriptId}`;
    await sql`delete from inbound_queue where id = ${queue.id}`;
    const [row] = await sql`select inbound_script_id, inbound_queue_id, status, released_at from workspace_number where id = ${linked.historyId}`;
    expect(row).toMatchObject({ inbound_script_id: null, inbound_queue_id: null, status: 'released' });
    expect(row.released_at.toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });

  test.each(['lifecycle', 'creation date'])("nested writers cannot change released %s", async (change) => {
    const name = `owned_history_${randomUUID().replaceAll('-', '')}`;
    const patch = change === 'lifecycle' ? "status = 'active', released_at = null" : "created_at = '2050-01-01T00:00:00Z'";
    await sql.unsafe(`create function ${name}() returns trigger language plpgsql as $$ begin update workspace_number set ${patch} where id = ${releasedId}; return NEW; end $$`);
    await sql.unsafe(`create trigger ${name} after update of name on workspace for each row when (new.id = '${workspace}'::uuid) execute function ${name}()`);
    try {
      await sql`update workspace set name = 'Owned nested history probe' where id = ${workspace}`;
      const [row] = await sql`select status, released_at, created_at from workspace_number where id = ${releasedId}`;
      expect(row.status).toBe('released');
      expect(row.released_at.toISOString()).toBe('2026-10-01T12:00:00.000Z');
      expect(row.created_at.toISOString()).toBe('2026-08-15T00:00:00.000Z');
    } finally {
      await sql.unsafe(`drop trigger ${name} on workspace`);
      await sql.unsafe(`drop function ${name}()`);
    }
  });

});
