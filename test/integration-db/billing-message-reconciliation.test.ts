import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

const provider = vi.hoisted(() => {
  vi.stubEnv("TZ", "UTC");
  return { list: vi.fn(), workspaces: [] as string[] };
});
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async (args: { workspace_id: string }) => {
    provider.workspaces.push(args.workspace_id);
    return { usage: { records: { list: provider.list } } };
  },
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
  emitPostgresChangeEvent: vi.fn(async () => undefined),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = randomUUID();
const foreign = randomUUID();
const now = new Date("2026-10-05T12:00:00.000Z");
const createdAt = "2026-10-01T12:00:00.000Z";
function usage(category: string, quantity: number, usageUnit = "messages") {
  return {
    category,
    description: category,
    usage: String(quantity),
    usageUnit,
    price: 0.01,
    startDate: new Date("2026-09-05"),
    endDate: new Date("2026-10-05"),
  };
}

suite(
  "SMS/MMS reconciliation through scoped Postgres and persisted drift (#2112)",
  () => {
    beforeAll(() => {
      vi.stubEnv("DATABASE_URL", databaseUrl);
      vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
      vi.stubEnv("BASE_URL", "http://127.0.0.1:3038");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
    });
    async function services() {
      return {
        ...(await import("@/server/db")),
        ...(await import("@/lib/billing-reconcile-workspace.server")),
        ...(await import("@/lib/billing-reconciliation.server")),
        ...(await import("@/lib/billing-reconciliation-snapshot.server")),
        ...(await import("@/lib/worker/webhook-side-effects.server")),
        ...(await import("@/lib/merge-workspace-twilio-data.server")),
      };
    }
    async function cleanup() {
      const { pool, invalidateWorkspaceTwilioData } = await services();
      for (const id of [workspace, foreign]) {
        await pool`delete from job where workspace_id = ${id}`;
        await pool`delete from transaction_history where workspace = ${id}`;
        await pool`delete from message where workspace = ${id}`;
        await pool`delete from workspace where id = ${id}`;
        invalidateWorkspaceTwilioData(id);
      }
    }
    beforeEach(async () => {
      await cleanup();
      const { pool } = await services();
      for (const id of [workspace, foreign]) {
        await pool`insert into workspace (id, name, credits, twilio_data) values (${id}, 'Message reconciliation fixture', 1000, ${JSON.stringify({ unrelated: "retained" })}::jsonb)`;
      }
      provider.workspaces.length = 0;
      provider.list.mockReset().mockResolvedValue([]);
    });
    afterAll(async () => {
      try {
        await cleanup();
        const { pool, directPool } = await services();
        await Promise.all([pool.end(), directPool.end()]);
      } finally {
        vi.useRealTimers();
        vi.unstubAllEnvs();
      }
    });
    async function message(
      kind: "SMS" | "MMS",
      segments = 1,
      id = workspace,
      direction = "outbound-api",
      date = createdAt,
    ) {
      const sid = `SM${randomUUID().replaceAll("-", "")}`;
      const { pool } = await services();
      await pool`insert into message (sid, workspace, status, direction, body, "from", "to", num_segments, num_media, date_created)
      values (${sid}, ${id}, 'delivered', ${direction}, 'Fixture message', '+15555550111', '+15555550112', ${String(segments)}, ${kind === "MMS" ? "1" : "0"}, ${date})`;
      return sid;
    }
    async function bill(kind: "SMS" | "MMS", segments = 1) {
      const sid = await message(kind, segments);
      const { pool, runSmsStatusSideEffects } = await services();
      await runSmsStatusSideEffects({
        messageSid: sid,
        twilioParams: { MessageStatus: "delivered" },
      });
      await pool`update transaction_history set created_at = ${createdAt} where workspace = ${workspace} and message_sid = ${sid}`;
      return sid;
    }
    async function reconcile(records: ReturnType<typeof usage>[]) {
      provider.list.mockResolvedValue(records);
      const {
        pool,
        reconcileWorkspaceBilling,
        getWorkspaceBillingReconciliationSnapshot,
      } = await services();
      const result = await reconcileWorkspaceBilling({
        workspaceId: workspace,
        source: "cron",
      });
      const [saved] =
        await pool`select twilio_data from workspace where id = ${workspace}`;
      expect(saved.twilio_data.unrelated).toBe("retained");
      expect(provider.workspaces.length).toBeGreaterThan(0);
      expect(provider.workspaces.every((id) => id === workspace)).toBe(true);
      expect(provider.list).toHaveBeenCalledWith({
        startDate: new Date("2026-09-05"),
        endDate: new Date("2026-10-05"),
      });
      return {
        ...result,
        saved: getWorkspaceBillingReconciliationSnapshot(saved.twilio_data),
        data: saved.twilio_data,
      };
    }

    test("real multi-segment SMS debit reaches the bounded loader without MMS contamination", async () => {
      await bill("SMS", 3);
      const result = await reconcile([usage("sms-outbound", 3)]);
      expect(result.report.categories.sms).toMatchObject({
        variance: 0,
        ledgerEvents: 1,
        ledgerCredits: 6,
      });
      expect(result.report.categories.mms.ledgerEvents).toBe(0);
      expect(result.report.entityAudit.messageGap).toBe(0);
      expect(result.saved).toMatchObject({
        smsVariance: 0,
        mmsVariance: 0,
        materialVariance: false,
      });
    });
    test("real MMS debit reconciles and persists without phantom SMS segments", async () => {
      await bill("MMS");
      const result = await reconcile([usage("mms-outbound", 1)]);
      expect(result.report.categories.sms).toMatchObject({
        variance: 0,
        ledgerCredits: 0,
      });
      expect(result.report.categories.mms).toMatchObject({
        variance: 0,
        ledgerEvents: 1,
        ledgerCredits: 4,
      });
      expect(result.report.entityAudit.messageGap).toBe(0);
      expect(result.saved).toMatchObject({
        mmsVariance: 0,
        materialVariance: false,
      });
    });
    test("mixed real debits reconcile while the original debit total and signs stay intact", async () => {
      await bill("SMS", 3);
      await bill("MMS");
      await bill("MMS");
      const result = await reconcile([
        usage("sms-outbound", 3),
        usage("mms-outbound", 2),
      ]);
      expect(result.report.categories.sms.variance).toBe(0);
      expect(result.report.categories.mms.variance).toBe(0);
      expect(result.report.ledgerDebitCredits).toBe(14);
      expect(result.report.entityAudit).toMatchObject({
        billableMessages: 3,
        debitedMessages: 3,
        messageGap: 0,
      });
      expect(result.saved?.materialVariance).toBe(false);
      const { pool } = await services();
      expect(
        (
          await pool`select amount from transaction_history where workspace = ${workspace} order by id`
        ).map((row) => row.amount),
      ).toEqual([-6, -4, -4]);
      expect(
        (await pool`select credits from workspace where id = ${workspace}`)[0]
          .credits,
      ).toBe(986);
    });
    test("provider aggregate and leaf records survive the adapter without double counting", async () => {
      await bill("SMS", 3);
      await bill("MMS");
      const result = await reconcile([
        usage("sms-outbound", 3),
        usage("sms-outbound-longcode", 3),
        usage("mms-outbound", 1),
        usage("mms-outbound-longcode", 1),
      ]);
      expect(result.report.categories.sms.variance).toBe(0);
      expect(result.report.categories.mms.variance).toBe(0);
      expect(result.saved?.materialVariance).toBe(false);
    });
    test("foreign, inbound and out-of-period rows cannot change the workspace result", async () => {
      await bill("MMS");
      const { pool } = await services();
      await message("MMS", 1, foreign);
      await message("MMS", 1, workspace, "inbound");
      await message(
        "SMS",
        3,
        workspace,
        "outbound-api",
        "2026-09-04T23:59:59.000Z",
      );
      await pool`insert into transaction_history (workspace, type, amount, idempotency_key, note, created_at)
      values (${foreign}, 'DEBIT', -40, ${`sms:foreign-${randomUUID()}`}, 'Unknown foreign marker', ${createdAt}),
             (${workspace}, 'DEBIT', -60, ${`sms:old-${randomUUID()}`}, 'Unknown historical marker', '2026-09-04T23:59:59.000Z')`;
      const result = await reconcile([
        usage("mms-outbound", 1),
        usage("mms-inbound", 1),
      ]);
      expect(result.report.ledgerDebitCredits).toBe(4);
      expect(result.report.unrecognizedDebitEvents).toBe(0);
      expect(result.report.entityAudit.messageGap).toBe(0);
      expect(result.saved?.materialVariance).toBe(false);
    });
    test("missing durable note stays unrecognized through the real ledger projection", async () => {
      const sid = await bill("SMS", 2);
      const { pool } = await services();
      await pool`update transaction_history set note = null where workspace = ${workspace} and message_sid = ${sid}`;
      const result = await reconcile([]);
      expect(result.report.unrecognizedDebitEvents).toBe(1);
      expect(result.report.ledgerDebitCredits).toBe(4);
      expect(result.saved).toMatchObject({
        unrecognizedDebitEvents: 1,
        materialVariance: true,
      });
    });
    test("unsupported MMS provider units remain null after actual persistence and normalization", async () => {
      const result = await reconcile([usage("mms-outbound", 0, "bytes")]);
      expect(result.report.categories.mms.variance).toBeNull();
      expect(result.saved).toMatchObject({
        smsVariance: 0,
        mmsVariance: null,
        materialVariance: true,
      });
      expect(
        result.data.billingReconciliationDriftAlert.mmsVariance,
      ).toBeNull();
    });
    test("MMS drift is recorded once, clears on balance, then re-arms", async () => {
      const first = await reconcile([usage("mms-outbound", 3)]);
      expect(first.saved).toMatchObject({
        smsVariance: 0,
        mmsVariance: 3,
        materialVariance: true,
      });
      expect(first.data.billingReconciliationDriftAlert).toMatchObject({
        mmsVariance: 3,
      });
      const { pool, invalidateWorkspaceTwilioData } = await services();
      await pool`update workspace set twilio_data = jsonb_set(twilio_data, '{billingReconciliationDriftAlert,alertedAt}', '"2026-10-04T01:00:00.000Z"'::jsonb) where id = ${workspace}`;
      invalidateWorkspaceTwilioData(workspace);
      const second = await reconcile([usage("mms-outbound", 4)]);
      expect(second.data.billingReconciliationDriftAlert).toMatchObject({
        mmsVariance: 3,
        alertedAt: "2026-10-04T01:00:00.000Z",
      });
      const balanced = await reconcile([]);
      expect(balanced.saved?.materialVariance).toBe(false);
      expect(balanced.data.billingReconciliationDriftAlert).toBeUndefined();
      const again = await reconcile([usage("mms-outbound", 5)]);
      expect(again.data.billingReconciliationDriftAlert.mmsVariance).toBe(5);
    });
    test("a missing debit still appears in the entity audit", async () => {
      await message("SMS", 3);
      const result = await reconcile([usage("sms-outbound", 3)]);
      expect(result.report.entityAudit).toMatchObject({
        billableMessages: 1,
        debitedMessages: 0,
        messageGap: 1,
      });
      expect(result.report.categories.sms.variance).toBe(3);
      expect(result.saved?.materialVariance).toBe(true);
    });
  },
);
