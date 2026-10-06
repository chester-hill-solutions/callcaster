import { randomUUID } from "node:crypto";
import { makePortalConfig } from "../fixtures/workspace-twilio-portal-config";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const provider = vi.hoisted(() => ({ create: vi.fn(), reverseQueue: false }));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitQueueEvent: vi.fn(async () => undefined),
  emitChatMessageEvent: vi.fn(async () => undefined),
  emitPostgresChangeEvent: vi.fn(async () => undefined),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async () => ({ messages: { create: provider.create } }),
  getWorkspaceTwilioPortalConfig: async () => makePortalConfig(),
}));

vi.mock("@/lib/database/campaign.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/database/campaign.server")>();
  return { ...original, getCampaignQueueById: async (...args: Parameters<typeof original.getCampaignQueueById>) => {
    const rows = await original.getCampaignQueueById(...args);
    return provider.reverseQueue ? [...rows].reverse() : rows;
  } };
});
vi.mock("@/lib/campaign-sms-pre-dispatch-gate.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-sms-pre-dispatch-gate.server")>()),
  resolvePreDispatchGate: async () => null,
}));
vi.mock("@/lib/caller-id-usability.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/caller-id-usability.server")>()),
  resolveCallerIdUsability: async () => ({ kind: "ok" }),
}));
vi.mock("@/lib/recipient-calling-window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recipient-calling-window")>()),
  recipientCallingWindowStatus: () => ({ allowed: true }),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = randomUUID();
const otherWorkspace = randomUUID();
const userId = randomUUID();

suite("campaign message estimates against actual ledger debits (#2114)", () => {
  beforeAll(() => {
    vi.stubEnv("TZ", "UTC");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
  });
  async function services() {
    return {
      ...(await import("@/server/db")),
      ...(await import("@/lib/campaign-billing.server")),
      ...(await import("@/lib/campaign-sms-dispatch.server")),
      ...(await import("@/lib/worker/webhook-side-effects.server")),
    };
  }
  async function cleanup() {
    const { pool } = await services();
    for (const id of [workspace, otherWorkspace]) {
      await pool`delete from job where workspace_id = ${id}`;
      await pool`delete from transaction_history where workspace = ${id}`;
      await pool`delete from message where workspace = ${id}`;
      await pool`delete from outreach_attempt where workspace = ${id}`;
      await pool`delete from campaign_queue where workspace = ${id}`;
      await pool`delete from contact where workspace = ${id}`;
      await pool`delete from campaign where workspace = ${id}`;
      await pool`delete from workspace where id = ${id}`;
    }
  }
  beforeEach(async () => {
    await cleanup();
    provider.reverseQueue = false;
    provider.create.mockReset().mockRejectedValue(new Error("Unexpected provider IO in stored-quantity fixture"));
    const { pool } = await services();
    await pool`insert into "user" (id, username) values (${userId}, ${`estimate-${userId}`}) on conflict (id) do nothing`;
    await pool`insert into workspace (id, name, credits) values (${workspace}, 'Estimate fixture', 10000), (${otherWorkspace}, 'Estimate isolation', 10000)`;
  });
  afterAll(async () => {
    try {
      await cleanup();
      const { pool, directPool } = await services();
      await pool`delete from "user" where id = ${userId}`;
      await Promise.all([pool.end(), directPool.end()]);
    } finally { vi.unstubAllEnvs(); }
  });
  async function campaign(body: string, media = false, owner = workspace) {
    const { pool } = await services();
    const [row] = await pool`insert into campaign (workspace, type, body_text, message_media, status, title)
      values (${owner}, 'message', ${body}, ${media ? ['fixture.png'] : []}::text[], 'paused', ${randomUUID()}) returning id`;
    return Number(row.id);
  }
  async function contact(campaignId: number, firstname: string | null = 'Sam', owner = workspace, phone = '+15555550123') {
    const { pool } = await services();
    const [row] = await pool`insert into contact (workspace, firstname, phone, line_type) values (${owner}, ${firstname}, ${phone}, 'mobile') returning id`;
    await pool`insert into campaign_queue (workspace, campaign_id, contact_id, queue_state, attempts, attempt_count)
      values (${owner}, ${campaignId}, ${row.id}, 'queued', 0, 0)`;
    return Number(row.id);
  }
  async function debit(campaignId: number, contactId: number, body: string, segments: number, { media = false, to = '+15555550123' }: { media?: boolean; to?: string } = {}) {
    const { pool, runSmsStatusSideEffects } = await services();
    const sid = `SM${randomUUID().replaceAll('-', '')}`;
    await pool`insert into message (sid, workspace, campaign_id, contact_id, status, direction, body, "from", "to", num_segments, num_media)
      values (${sid}, ${workspace}, ${campaignId}, ${contactId}, 'delivered', 'outbound-api', ${body}, '+15555550124', ${to}, ${String(segments)}, ${media ? '1' : '0'})`;
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: 'delivered' } });
  }
  async function summary(campaignId: number, queuedCount: number) {
    const { loadCampaignBillingSummary } = await services();
    return loadCampaignBillingSummary({ workspaceId: workspace, campaignId, campaignType: 'message', queuedCount });
  }

  test.each([
    { label: 'single-segment SMS control', body: 'Hello', segments: 1, credits: 2, media: false },
    { label: 'two-segment GSM message', body: 'A'.repeat(200), segments: 2, credits: 4, media: false },
    { label: 'two-segment Unicode message', body: '漢'.repeat(71), segments: 2, credits: 4, media: false },
    { label: 'MMS with a three-segment text body', body: 'A'.repeat(400), segments: 3, credits: 4, media: true },
    { label: 'media-only MMS', body: '', segments: 0, credits: 4, media: true },
  ])('$label matches the persisted debit', async ({ body, segments, credits, media }) => {
    const id = await campaign(body, media); const recipient = await contact(id);
    const estimate = (await summary(id, 1)).estimate;
    await debit(id, recipient, body, segments, { media });
    const report = await summary(id, 1);
    expect(report.actualDebitCredits).toBe(credits);
    expect(estimate.totalCredits).toBe(credits);
    expect(estimate.perContactCredits).toBe(credits);
    expect(estimate.rateDescription).toContain(media ? '4 credits per MMS' : '2 credits per SMS segment');
  });

  test('personalized bodies cross the segment boundary for only the longer recipient', async () => {
    const prefix = 'A'.repeat(150); const id = await campaign(prefix + '{{firstname}}');
    const short = await contact(id, 'Sam'); const long = await contact(id, 'Alexandra Longsurname', workspace, '+15555550125');
    const estimate = (await summary(id, 2)).estimate;
    await debit(id, short, prefix + 'Sam', 1);
    await debit(id, long, prefix + 'Alexandra Longsurname', 2, { to: '+15555550125' });
    const report = await summary(id, 2);
    expect(report.actualDebitCredits).toBe(6);
    expect(estimate.totalCredits).toBe(6);
    expect(estimate.perContactCredits).toBe(3);
    expect(estimate.rateDescription).toContain('personalized');
  });

  test('template fallbacks use the same rendered text as dispatch', async () => {
    const id = await campaign('A'.repeat(150) + '{{firstname|"there is no short name"}}');
    const recipient = await contact(id, null);
    const estimate = (await summary(id, 1)).estimate;
    await debit(id, recipient, 'A'.repeat(150) + 'there is no short name', 2);
    const report = await summary(id, 1);
    expect(report.actualDebitCredits).toBe(4);
    expect(estimate.totalCredits).toBe(4);
  });

  test('completed, undialable, other-campaign and other-workspace rows do not enter the estimate', async () => {
    const id = await campaign('A'.repeat(200)); const included = await contact(id);
    const completed = await contact(id, 'Completed', workspace, '+15555550124'); const stampOnly = await contact(id, 'Stamp', workspace, '+15555550125');
    await contact(id, 'No phone', workspace, '');
    const otherId = await campaign('A'.repeat(400)); await contact(otherId, 'Other campaign', workspace, '+15555550126');
    const foreignId = await campaign('A'.repeat(400), false, otherWorkspace); const foreignContact = await contact(foreignId, 'Other', otherWorkspace, '+15555550127');
    const { pool } = await services();
    await pool`insert into campaign_queue (workspace, campaign_id, contact_id, queue_state, attempts, attempt_count)
      values (${otherWorkspace}, ${id}, ${foreignContact}, 'queued', 0, 0)`;
    await pool`update campaign_queue set queue_state = 'dequeued' where contact_id = ${completed}`;
    await pool`update campaign_queue set dequeued_at = now() where contact_id = ${stampOnly}`;
    const estimate = (await summary(id, 1)).estimate;
    await debit(id, included, 'A'.repeat(200), 2);
    const report = await summary(id, 1);
    expect(report.actualDebitCredits).toBe(4);
    expect(estimate.totalCredits).toBe(4);
  });

  test('an empty queue has a zero estimate and no average division error', async () => {
    const id = await campaign('A'.repeat(200));
    const report = await summary(id, 0);
    expect(report.estimate.contactCount).toBe(0);
    expect(report.estimate.totalCredits).toBe(0);
    expect(report.estimate.perContactCredits).toBe(0);
  });

  test('a foreign-workspace campaign cannot supply its message text', async () => {
    const id = await campaign('Hello', false, otherWorkspace);
    await expect(summary(id, 1)).rejects.toThrow('Campaign not found');
  });

  test('a malformed queue link cannot read another workspace contact', async () => {
    const id = await campaign('{{firstname}}');
    const foreignId = await campaign('Hello', false, otherWorkspace);
    const foreignContact = await contact(foreignId, 'Private contact', otherWorkspace);
    const { pool } = await services();
    await pool`insert into campaign_queue (workspace, campaign_id, contact_id, queue_state, attempts, attempt_count)
      values (${workspace}, ${id}, ${foreignContact}, 'queued', 0, 0)`;
    await expect(summary(id, 1)).rejects.toThrow('Queued contact not found in workspace');
  });

  test('a queue beyond one batch is counted once per recipient', async () => {
    const id = await campaign('Hello'); const { pool } = await services();
    await pool`with recipients as (
      insert into contact (workspace, firstname, phone)
      select ${workspace}::uuid, 'Sam', '+1555' || lpad(n::text, 7, '0') from generate_series(1,1001) n returning id
    ) insert into campaign_queue (workspace, campaign_id, contact_id, queue_state, attempts, attempt_count)
      select ${workspace}::uuid, ${id}::bigint, id, 'queued', 0, 0 from recipients`;
    const report = await summary(id, 1001);
    expect(report.estimate.totalCredits).toBe(2002);
    expect(report.estimate.perContactCredits).toBe(2);
  });

  test.each(['opt-out', 'normalized duplicate', 'known landline'])('remaining estimate matches real dispatch for %s', async (skip) => {
    const id = await campaign('A'.repeat(200));
    await contact(id);
    const skipped = await contact(id, 'Skipped', workspace, skip === 'normalized duplicate' ? '(555) 555-0123' : '+15555550125');
    const { pool, dispatchCampaignSmsBatch, runSmsStatusSideEffects } = await services();
    if (skip === 'opt-out') await pool`update contact set opt_out = true where id = ${skipped}`;
    if (skip === 'known landline') await pool`update contact set line_type = 'landline' where id = ${skipped}`;
    const estimate = (await summary(id, 2)).estimate;
    expect(estimate.totalCredits).toBe(4);
    expect(estimate.contactCount).toBe(1);
    const sid = `SM${randomUUID().replaceAll('-', '')}`;
    provider.create.mockResolvedValue({ sid, status: 'sent', direction: 'outbound-api', numSegments: '2', numMedia: '0', to: '+15555550123', from: '+15555550124', body: 'A'.repeat(200) });
    const result = await dispatchCampaignSmsBatch({ workspaceId: workspace, campaignId: String(id), userId, callerId: '+15555550124' });
    expect(result).toMatchObject({ kind: 'dispatched', counts: { sent: 1, failed: 0 } });
    expect(provider.create).toHaveBeenCalledTimes(1);
    await pool`update message set status = 'delivered' where sid = ${sid}`;
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: 'delivered' } });
    const report = await summary(id, 0);
    expect(report.actualDebitCredits).toBe(estimate.totalCredits);
    expect(report.estimate.totalCredits).toBe(0);
  });

  test('a previously sent destination is excluded from remaining cost', async () => {
    const id = await campaign('A'.repeat(200)); const recipient = await contact(id);
    await debit(id, recipient, 'A'.repeat(200), 2);
    const report = await summary(id, 1);
    expect(report.estimate.totalCredits).toBe(0);
    expect(report.estimate.contactCount).toBe(0);
    expect(report.actualDebitCredits).toBe(4);
  });

  test.each(['queued', 'failed'])('a %s pending intent follows the real dispatch duplicate predicate', async (status) => {
    const id = await campaign('A'.repeat(200)); const recipient = await contact(id);
    const { pool } = await services();
    const { countCampaignMessagesToPhone, pendingMessageSid } = await import('@/lib/message-db.server');
    await pool`insert into message (sid, workspace, campaign_id, contact_id, status, direction, body, "from", "to")
      values (${pendingMessageSid(randomUUID())}, ${workspace}, ${id}, ${recipient}, ${status}, 'outbound-api', 'A', '+15555550124', '+15555550123')`;
    const report = await summary(id, 1);
    expect(report.estimate.totalCredits).toBe(status === 'failed' ? 4 : 0);
    expect(await countCampaignMessagesToPhone(workspace, id, '+15555550123')).toBe(status === 'failed' ? 0 : 1);
  });


  test('previous-message history beyond one batch excludes both destinations', async () => {
    const id = await campaign('A'.repeat(200));
    await contact(id);
    await contact(id, 'Second', workspace, '+15555550125');
    const { pool } = await services();
    await pool`insert into message (sid, workspace, campaign_id, status, direction, body, "from", "to")
      select 'SM' || ${randomUUID().replaceAll('-', '')} || lpad(n::text, 4, '0'), ${workspace}::uuid, ${id}::bigint,
      'queued', 'outbound-api', 'A', '+15555550124', case when n = 1001 then '+15555550125' else '+15555550123' end
      from generate_series(1, 1001) n`;
    const report = await summary(id, 2);
    expect(report.estimate.totalCredits).toBe(0);
    expect(report.estimate.contactCount).toBe(0);
  });


  test('reversed queue loads use the same first personalized duplicate as the estimate', async () => {
    const prefix = 'A'.repeat(150); const id = await campaign(prefix + '{{firstname}}');
    await contact(id, 'Sam');
    await contact(id, 'Alexandra Longsurname');
    const estimate = (await summary(id, 2)).estimate;
    expect(estimate.totalCredits).toBe(2);
    expect(estimate.contactCount).toBe(1);
    const sid = `SM${randomUUID().replaceAll('-', '')}`;
    provider.reverseQueue = true;
    provider.create.mockResolvedValue({ sid, status: 'sent', direction: 'outbound-api', numSegments: '1', numMedia: '0', to: '+15555550123', from: '+15555550124', body: prefix + 'Sam' });
    const { pool, dispatchCampaignSmsBatch, runSmsStatusSideEffects } = await services();
    const result = await dispatchCampaignSmsBatch({ workspaceId: workspace, campaignId: String(id), userId, callerId: '+15555550124' });
    expect(result).toMatchObject({ kind: 'dispatched', counts: { sent: 1, failed: 0 } });
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(provider.create).toHaveBeenCalledWith(expect.objectContaining({ body: prefix + 'Sam' }));
    await pool`update message set status = 'delivered' where sid = ${sid}`;
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: 'delivered' } });
    expect((await summary(id, 0)).actualDebitCredits).toBe(estimate.totalCredits);
  });

  test('a known landline does not reserve a mobile duplicate even when the load is reversed', async () => {
    const prefix = 'A'.repeat(150); const id = await campaign(prefix + '{{firstname}}'); const first = await contact(id, 'Alexandra Longsurname');
    await contact(id, 'Sam');
    const { pool, dispatchCampaignSmsBatch, runSmsStatusSideEffects } = await services();
    await pool`update contact set line_type = 'landline' where id = ${first}`;
    const estimate = (await summary(id, 2)).estimate;
    expect(estimate.totalCredits).toBe(2);
    provider.reverseQueue = true;
    const sid = `SM${randomUUID().replaceAll('-', '')}`;
    provider.create.mockResolvedValue({ sid, status: 'sent', direction: 'outbound-api', numSegments: '1', numMedia: '0', to: '+15555550123', from: '+15555550124', body: prefix + 'Sam' });
    const result = await dispatchCampaignSmsBatch({ workspaceId: workspace, campaignId: String(id), userId, callerId: '+15555550124' });
    expect(result).toMatchObject({ kind: 'dispatched', counts: { sent: 1, failed: 0 } });
    expect(provider.create).toHaveBeenCalledTimes(1);
    await pool`update message set status = 'delivered' where sid = ${sid}`;
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: 'delivered' } });
    expect((await summary(id, 0)).actualDebitCredits).toBe(estimate.totalCredits);
  });

  test('remaining estimate matches successive 50-row calls after a known landline', async () => {
    const prefix = 'A'.repeat(150); const id = await campaign(prefix + '{{firstname}}'); const first = await contact(id, 'Alexandra Longsurname');
    const { pool, dispatchCampaignSmsBatch, runSmsStatusSideEffects } = await services();
    await pool`update contact set line_type = 'landline' where id = ${first}`;
    for (let index = 0; index < 49; index += 1) {
      const optedOut = await contact(id, 'Opted out', workspace, '+1555' + String(6000000 + index));
      await pool`update contact set opt_out = true where id = ${optedOut}`;
    }
    await contact(id, 'Sam');
    const estimate = (await summary(id, 51)).estimate;
    expect(estimate.totalCredits).toBe(2);
    expect(estimate.contactCount).toBe(1);
    const args = { workspaceId: workspace, campaignId: String(id), userId, callerId: '+15555550124', maxContacts: 50 };
    const firstCall = await dispatchCampaignSmsBatch(args);
    expect(firstCall).toMatchObject({ kind: 'dispatched', counts: { sent: 0, dequeued: 50, failed: 0 } });
    expect(provider.create).not.toHaveBeenCalled();
    expect((await summary(id, 1)).estimate.totalCredits).toBe(estimate.totalCredits);
    const sid = `SM${randomUUID().replaceAll('-', '')}`;
    provider.create.mockResolvedValue({ sid, status: 'sent', direction: 'outbound-api', numSegments: '1', numMedia: '0', to: '+15555550123', from: '+15555550124', body: prefix + 'Sam' });
    const secondCall = await dispatchCampaignSmsBatch(args);
    expect(secondCall).toMatchObject({ kind: 'dispatched', counts: { sent: 1, failed: 0 } });
    expect(provider.create).toHaveBeenCalledTimes(1);
    await pool`update message set status = 'delivered' where sid = ${sid}`;
    await runSmsStatusSideEffects({ messageSid: sid, twilioParams: { MessageStatus: 'delivered' } });
    const report = await summary(id, 0);
    expect(report.actualDebitCredits).toBe(estimate.totalCredits);
    expect(report.estimate.totalCredits).toBe(0);
  });

});
