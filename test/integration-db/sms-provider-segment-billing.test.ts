import { randomUUID } from "node:crypto";
import { RouterContextProvider } from "react-router";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const provider = vi.hoisted(() => {
  vi.stubEnv("TZ", "UTC");
  return { fetch: vi.fn(), list: vi.fn(), workspaces: [] as string[] };
});
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async (args: { workspace_id: string }) => {
    provider.workspaces.push(args.workspace_id);
    return {
      messages: Object.assign((sid: string) => ({ fetch: () => provider.fetch(sid) }), { list: provider.list }),
      calls: { list: async () => [] },
    };
  },
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
  emitChatMessageEvent: vi.fn(async () => undefined),
  emitQueueEvent: vi.fn(async () => undefined),
  emitPostgresChangeEvent: vi.fn(async () => undefined),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = randomUUID();
const accountSid = `AC${randomUUID().replaceAll("-", "")}`;
const authToken = randomUUID();
const callbackUrl = "http://127.0.0.1:3038/api/sms/status";
const from = `+1555${Math.floor(Math.random() * 10_000_000).toString().padStart(7, "0")}`;
const to = "+15555550112";

suite("authoritative SMS quantities against real Postgres (#2150)", () => {
  beforeAll(() => {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    vi.stubEnv("BASE_URL", "http://127.0.0.1:3038");
    vi.stubEnv("TWILIO_VALIDATE_WEBHOOKS", "true");
  });

  async function services() {
    return {
      ...(await import("@/server/db")),
      ...(await import("@/lib/message-db.server")),
      ...(await import("@/lib/worker/webhook-side-effects.server")),
      ...(await import("@/lib/billing-reconciliation.server")),
      ...(await import("@/lib/twilio-open-sync.server")),
    };
  }

  async function cleanup() {
    const { pool } = await services();
    await pool`delete from job where workspace_id = ${workspace}`;
    await pool`delete from transaction_history where workspace = ${workspace}`;
    await pool`delete from message where workspace = ${workspace}`;
    await pool`delete from outreach_attempt where workspace = ${workspace}`;
    await pool`delete from contact where workspace = ${workspace}`;
    await pool`delete from campaign where workspace = ${workspace}`;
    await pool`delete from workspace where id = ${workspace}`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspace);
  }

  beforeEach(async () => {
    await cleanup();
    const { pool } = await services();
    await pool`insert into workspace (id, name, credits, twilio_data)
      values (${workspace}, 'SMS quantity fixture', 1000, ${JSON.stringify({ sid: accountSid, authToken })}::jsonb)`;
    const [saved] = await pool`select twilio_data from workspace where id = ${workspace}`;
    expect(saved.twilio_data).toEqual({ sid: accountSid, authToken });
    provider.fetch.mockReset();
    provider.list.mockReset().mockResolvedValue([]);
    provider.workspaces.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      await cleanup();
      const { pool, directPool } = await services();
      await Promise.all([pool.end(), directPool.end()]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  async function message(segments: string | null = null, media = "0", intent = true) {
    const sid = `SM${randomUUID().replaceAll("-", "")}`;
    const clientRef = randomUUID();
    const { pool } = await services();
    await pool`insert into message (sid, client_ref, workspace, status, direction, body, "from", "to", num_segments, num_media, date_created)
      values (${intent ? `pending:${clientRef}` : sid}, ${clientRef}, ${workspace}, 'queued', 'outbound-api', ${"A".repeat(400)}, ${from}, ${to}, ${segments}, ${media}, ${new Date().toISOString()})`;
    provider.fetch.mockImplementation(async (requestedSid: string) => ({
      sid: requestedSid, accountSid, status: "delivered", numSegments: "3", numMedia: "0",
    }));
    return sid;
  }

  async function callback(sid: string, extra: Record<string, string> = {}, status = "delivered") {
    const fields = { SmsSid: sid, MessageSid: sid, MessageStatus: status, AccountSid: accountSid, From: from, To: to, ...extra };
    const request = new Request(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": getExpectedTwilioSignature(authToken, callbackUrl, fields),
      },
      body: new URLSearchParams(fields),
    });
    const { action } = await import("@/routes/api+/sms/status.action.server");
    const response = await asRouteResponse(action({ request, url: new URL(request.url), params: {}, context: new RouterContextProvider() }));
    expect(response.status).toBe(200);
    const { pool } = await services();
    const jobs = await pool`select params from job where workspace_id = ${workspace}
      and type = 'sms_status_side_effects' and params->>'sid' = ${sid}`;
    expect(jobs).toHaveLength(1);
    return jobs[0].params.twilioParams;
  }

  async function debit(sid: string, extra: Record<string, string> = {}) {
    const params = await callback(sid, extra);
    const { runSmsStatusSideEffects } = await services();
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: params });
  }

  async function ledger() {
    const { pool } = await services();
    return pool`select amount, idempotency_key from transaction_history where workspace = ${workspace} order by id`;
  }

  async function report(segments: number) {
    const { loadBillingReconciliationReport } = await services();
    return loadBillingReconciliationReport({
      workspaceId: workspace,
      twilioUsage: [{ category: "sms-outbound", description: "Outbound SMS", usage: String(segments), usageUnit: "segments", price: "0.01" }],
      referenceDate: new Date(),
    });
  }

  test("a signed recovery callback preserves its three-segment quantity before debit", async () => {
    const sid = await message();
    const params = await callback(sid, { NumSegments: "3", NumMedia: "0" });
    const { pool, runSmsStatusSideEffects } = await services();
    expect((await pool`select num_segments from message where sid = ${sid}`)[0].num_segments).toBe("3");
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: params });
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(await ledger()).toEqual([{ amount: -6, idempotency_key: `sms:${sid}` }]);
  });

  test.each([null, "0", "invalid", "3x", "1.5", "-1"])("incomplete quantity %s is fetched from the saved workspace before debit", async (stored) => {
    const sid = await message(stored);
    await debit(sid);
    expect(provider.fetch).toHaveBeenCalledWith(sid);
    expect(provider.workspaces).toEqual([workspace]);
    const { pool, runSmsStatusSideEffects } = await services();
    expect((await pool`select num_segments from message where sid = ${sid}`)[0].num_segments).toBe("3");
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: "delivered" } });
    expect(provider.fetch).toHaveBeenCalledTimes(1);
    expect(await ledger()).toEqual([{ amount: -6, idempotency_key: `sms:${sid}` }]);
  });

  test("open-sync saves provider quantity before its terminal billing job runs", async () => {
    const sid = await message(null, "0", false);
    provider.list.mockResolvedValueOnce([{ sid, status: "delivered", numSegments: "3", numMedia: "0" }]);
    const { pool, triggerTwilioOpenSync, runSmsStatusSideEffects } = await services();
    expect((await triggerTwilioOpenSync({ workspaceId: workspace, dateSentBackfillLimit: 0 })).ok).toBe(true);
    const [saved] = await pool`select num_segments, status from message where sid = ${sid}`;
    expect(saved).toEqual({ num_segments: "3", status: "delivered" });
    const [job] = await pool`select params from job where workspace_id = ${workspace} and type = 'sms_status_side_effects' and params->>'sid' = ${sid}`;
    expect(job).toBeTruthy();
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: job.params.twilioParams });
    // One workspace client belongs to the sweep; no extra metadata fetch is needed.
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(await ledger()).toEqual([{ amount: -6, idempotency_key: `sms:${sid}` }]);
  });

  test("a known send-time count keeps the existing three-segment debit", async () => {
    const sid = await message("3", "0", false);
    await debit(sid);
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(await ledger()).toEqual([{ amount: -6, idempotency_key: `sms:${sid}` }]);
  });

  test("unavailable provider quantity leaves no debit and remains visible in reconciliation", async () => {
    const sid = await message();
    provider.fetch.mockResolvedValueOnce({ sid, accountSid, status: "delivered", numSegments: "0", numMedia: "0" });
    const params = await callback(sid);
    const { logger } = await import("@/lib/logger.server");
    const warning = vi.spyOn(logger, "warn");
    const { runSmsStatusSideEffects } = await services();
    await expect(runSmsStatusSideEffects({ messageSid: sid, twilioParams: params })).rejects.toThrow(/SMS billing metadata unavailable/);
    expect(await ledger()).toEqual([]);
    expect(warning).toHaveBeenCalledWith("billing.sms_metadata_unavailable", expect.objectContaining({ workspaceId: workspace, sid }));
    expect((await report(3)).entityAudit.messageGap).toBe(1);
  });

  test("delivery results settle while unavailable billing metadata waits for retry", async () => {
    const sid = await message();
    const { pool } = await services();
    const [campaign] = await pool`insert into campaign (workspace, title, type, status)
      values (${workspace}, 'Quantity delivery control', 'message', 'running') returning id`;
    const [contact] = await pool`insert into contact (workspace, phone) values (${workspace}, ${to}) returning id`;
    const [attempt] = await pool`insert into outreach_attempt (workspace, campaign_id, contact_id)
      values (${workspace}, ${campaign.id}, ${contact.id}) returning id`;
    // Resolve first so the signed callback uses the saved provider SID.
    const { resolveMessageByClientRef } = await services();
    const [intent] = await pool`select client_ref from message where workspace = ${workspace}`;
    await resolveMessageByClientRef(workspace, intent.client_ref, { sid });
    await pool`update message set outreach_attempt_id = ${attempt.id}, campaign_id = ${campaign.id}, contact_id = ${contact.id} where sid = ${sid}`;
    provider.fetch.mockResolvedValueOnce({ sid, accountSid, numSegments: "0", numMedia: "0" });
    const params = await callback(sid);
    const { runSmsStatusSideEffects } = await services();
    await expect(runSmsStatusSideEffects({ messageSid: sid, twilioParams: params })).rejects.toThrow(/SMS billing metadata unavailable/);
    expect((await pool`select disposition from outreach_attempt where id = ${attempt.id}`)[0].disposition).toBe("delivered");
    expect(await ledger()).toEqual([]);
    // The same durable job can bill later without changing the delivery result.
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: params });
    expect(await ledger()).toEqual([{ amount: -6, idempotency_key: `sms:${sid}` }]);
    expect((await pool`select disposition from outreach_attempt where id = ${attempt.id}`)[0].disposition).toBe("delivered");
  });

  test("a provider lookup failure leaves billing pending and can recover on retry", async () => {
    const sid = await message();
    provider.fetch.mockRejectedValueOnce(new Error("Provider temporarily unavailable"));
    const params = await callback(sid);
    const { runSmsStatusSideEffects } = await services();
    await expect(runSmsStatusSideEffects({ messageSid: sid, twilioParams: params })).rejects.toThrow(/SMS billing metadata unavailable/);
    expect(await ledger()).toEqual([]);
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: params });
    expect(await ledger()).toEqual([{ amount: -6, idempotency_key: `sms:${sid}` }]);
  });

  test("a provider response for a different SID cannot supply the debit quantity", async () => {
    const sid = await message();
    provider.fetch.mockResolvedValueOnce({ sid: `SM${randomUUID().replaceAll("-", "")}`, accountSid, numSegments: "3", numMedia: "0" });
    const params = await callback(sid);
    const { runSmsStatusSideEffects } = await services();
    await expect(runSmsStatusSideEffects({ messageSid: sid, twilioParams: params })).rejects.toThrow(/provider message identity/);
    expect(await ledger()).toEqual([]);
  });

  test("a recovered multi-message blast has zero segment variance", async () => {
    for (const segments of [3, 4, 1]) {
      const sid = await message();
      provider.fetch.mockResolvedValueOnce({ sid, accountSid, status: "delivered", numSegments: String(segments), numMedia: "0" });
      await debit(sid);
    }
    const reconciliation = await report(8);
    expect(reconciliation.categories.sms.variance).toBe(0);
    expect(reconciliation.entityAudit.messageGap).toBe(0);
    const { pool } = await services();
    expect((await pool`select credits from workspace where id = ${workspace}`)[0].credits).toBe(984);
    expect(await ledger()).toHaveLength(3);
  });

  test("duplicate side effects retain one correctly sized debit", async () => {
    const sid = await message("3", "0", false);
    await debit(sid);
    const { runSmsStatusSideEffects } = await services();
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: "delivered" } });
    expect(await ledger()).toEqual([{ amount: -6, idempotency_key: `sms:${sid}` }]);
  });

  test("known MMS quantity keeps the flat four-credit rate", async () => {
    const sid = await message("0", "1", false);
    await debit(sid);
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(await ledger()).toEqual([{ amount: -4, idempotency_key: `sms:${sid}` }]);
  });

  test("a queued message does not fetch billing metadata or create a debit", async () => {
    const sid = await message(null, "0", false);
    const params = await callback(sid, {}, "queued");
    const { runSmsStatusSideEffects } = await services();
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: params });
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(await ledger()).toEqual([]);
  });
});
