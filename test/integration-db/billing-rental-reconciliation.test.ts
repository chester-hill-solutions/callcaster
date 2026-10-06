import { usageRecordsClient } from "../helpers/twilio-usage-page";
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
const fixture = vi.hoisted(() => ({
  accountSid: `AC${"a".repeat(32)}`,
  foreignAccount: `AC${"b".repeat(32)}`,
  list: vi.fn(),
  email: vi.fn(async () => ({ data: { id: "rental-fixture" }, error: null })),
  ops: vi.fn(async () => undefined),
  events: vi.fn(async () => undefined),
  log: vi.fn(),
  units: 0,
  setups: 0,
  rentalUnit: "numbers",
  rentalReadFails: false,
  smsUnits: 0,
  aggregateOnly: false,
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async () => ({
    accountSid: fixture.accountSid,
    usage: { records: usageRecordsClient(fixture.list) },
  }),
  removeWorkspacePhoneNumber: async () => {
    throw new Error("Provider writes are forbidden in this fixture");
  },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: fixture.email };
  },
}));
vi.mock("@/lib/ops-alert.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ops-alert.server")>()),
  notifyOps: fixture.ops,
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitTransactionHistoryInsertEvent: fixture.events,
  emitPostgresChangeEvent: fixture.events,
}));
vi.mock("@/lib/logger.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger.server")>();
  return { ...actual, logger: { ...actual.logger, warn: fixture.log } };
});
const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;
const workspace = randomUUID(),
  foreign = randomUUID(),
  owner = randomUUID(),
  foreignOwner = randomUUID();
const now = new Date("2026-10-06T12:00:00Z");
let sequence = 0;
async function services() {
  return {
    ...(await import("@/server/db")),
    ...(await import("@/lib/billing-reconcile-workspace.server")),
    ...(await import("@/lib/number-rental-billing.server")),
    ...(await import("@/lib/merge-workspace-twilio-data.server")),
    ...(await import("@/lib/transaction-history.server")),
    ...(await import("@/lib/billing-reconciliation-snapshot.server")),
  };
}
suite(
  "rental reconciliation through actual billing, scoped Postgres and alerts (#2113)",
  () => {
    beforeAll(async () => {
      vi.stubEnv("DATABASE_URL", url);
      vi.stubEnv("DATABASE_DIRECT_URL", url);
      vi.stubEnv("RESEND_API_KEY", "re_fixture");
      vi.stubEnv("BASE_URL", "http://127.0.0.1:3038");
      vi.stubEnv("TZ", "UTC");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      const { pool } = await services();
      await pool`insert into auth_user(id,name,email) values (${owner},'Rental owner',${`${owner}@example.test`}),(${foreignOwner},'Foreign owner',${`${foreignOwner}@example.test`})`;
      for (const [id, user] of [
        [workspace, owner],
        [foreign, foreignOwner],
      ]) {
        await pool`insert into workspace(id,name,credits,twilio_data,feature_flags,disabled) values (${id},'Rental reconciliation fixture',10000,${JSON.stringify({ unrelated: "retained", sid: fixture.accountSid, authToken: "fixture-token" })}::jsonb,'{}'::jsonb,false)`;
        await pool`insert into workspace_member(id,workspace_id,user_id,role_id) values (${randomUUID()},${id},${user},'owner')`;
      }
    });
    beforeEach(async () => {
      const { pool, invalidateWorkspaceTwilioData } = await services();
      for (const id of [workspace, foreign]) {
        await pool`delete from transaction_history where workspace=${id}`;
        await pool`delete from workspace_number_release where workspace=${id}`;
        await pool`delete from workspace_number_purchase where workspace=${id}`;
        await pool`delete from workspace_number where workspace=${id}`;
        await pool`update workspace set credits=10000,twilio_data=${JSON.stringify({ unrelated: "retained", sid: fixture.accountSid, authToken: "fixture-token" })}::jsonb where id=${id}`;
        invalidateWorkspaceTwilioData(id);
      }
      fixture.units = 0;
      fixture.setups = 0;
      fixture.rentalUnit = "numbers";
      fixture.rentalReadFails = false;
      fixture.smsUnits = 0;
      fixture.aggregateOnly = false;
      fixture.email.mockClear();
      fixture.ops.mockClear();
      fixture.log.mockClear();
      fixture.list
        .mockReset()
        .mockImplementation(
          async (params: {
            startDate: Date;
            endDate: Date;
            includeSubaccounts?: boolean;
          }) => {
            const monthly =
              params.startDate.toISOString().slice(0, 10) === "2026-09-01";
            if (monthly && fixture.rentalReadFails)
              throw new Error("Fixture rental provider read failed");
            return monthly
              ? [
                  {
                    category: fixture.aggregateOnly
                      ? "phonenumbers"
                      : "phonenumbers-local",
                    description: "Local rentals",
                    usage: String(fixture.units),
                    usageUnit: fixture.rentalUnit,
                    price: 0,
                    accountSid: fixture.accountSid,
                    startDate: params.startDate,
                    endDate: params.endDate,
                  },
                  {
                    category: "phonenumbers-setups",
                    description: "Setups",
                    usage: String(fixture.setups),
                    usageUnit: "number-setups",
                    price: 0,
                    accountSid: fixture.accountSid,
                    startDate: params.startDate,
                    endDate: params.endDate,
                  },
                ]
              : fixture.smsUnits > 0
                ? [
                    {
                      category: "sms-outbound",
                      description: "SMS",
                      usage: String(fixture.smsUnits),
                      usageUnit: "messages",
                      price: 0,
                      startDate: params.startDate,
                      endDate: params.endDate,
                    },
                  ]
                : [];
          },
        );
    });
    afterAll(async () => {
      try {
        const { pool, invalidateWorkspaceTwilioData } = await services();
        for (const id of [workspace, foreign]) {
          await pool`delete from transaction_history where workspace=${id}`;
          await pool`delete from workspace_number_release where workspace=${id}`;
          await pool`delete from workspace_number_purchase where workspace=${id}`;
          await pool`delete from workspace_number where workspace=${id}`;
          await pool`delete from workspace_member where workspace_id=${id}`;
          await pool`delete from workspace where id=${id}`;
          invalidateWorkspaceTwilioData(id);
        }
        await pool`delete from auth_user where id in (${owner},${foreignOwner})`;
      } finally {
        const { pool, directPool } = await services();
        await Promise.all([pool.end(), directPool.end()]);
        vi.useRealTimers();
        vi.unstubAllEnvs();
      }
    });
    async function number(
      createdAt = "2026-08-10T12:00:00Z",
      id = workspace,
      type = "rented",
    ) {
      const { pool } = await services();
      const sid = `PN${randomUUID().replaceAll("-", "")}`;
      const [row] =
        await pool`insert into workspace_number(workspace,type,created_at,phone_number,twilio_phone_number_sid) values (${id},${type},${createdAt},${`+1555${String(++sequence).padStart(7, "0")}`},${sid}) returning id,phone_number,created_at,twilio_phone_number_sid`;
      return {
        id: Number(row.id),
        phone: row.phone_number,
        createdAt: row.created_at,
        sid,
      };
    }
    async function debit(
      id: number,
      month = "2026-09",
      amount = -100,
      ws = workspace,
    ) {
      const { pool, db, insertTransactionHistoryIdempotent } = await services();
      const key = `number_rent:${id}:${month}`;
      await insertTransactionHistoryIdempotent(db, {
        workspaceId: ws,
        type: "DEBIT",
        amount,
        note: `Monthly rental (cycle ${month})`,
        idempotencyKey: key,
      });
      await pool`update transaction_history set created_at='2026-10-06T01:00:00.000Z' where workspace=${ws} and idempotency_key=${key}`;
    }
    async function reconcile() {
      const s = await services();
      const result = await s.reconcileWorkspaceBilling({
        workspaceId: workspace,
        source: "cron",
      });
      const [row] =
        await s.pool`select twilio_data,credits from workspace where id=${workspace}`;
      expect(row.twilio_data.unrelated).toBe("retained");
      expect(fixture.list).toHaveBeenCalledWith({
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-30"),
        includeSubaccounts: false,
      });
      return {
        ...result,
        data: row.twilio_data,
        credits: row.credits,
        normalized: s.getWorkspaceBillingReconciliationSnapshot(
          row.twilio_data,
        ),
      };
    }
    async function release(
      n: Awaited<ReturnType<typeof number>>,
      start = "2026-09-20T10:00:00Z",
      end = "2026-09-20T10:01:00Z",
      ws = workspace,
      account = fixture.accountSid,
    ) {
      const { pool } = await services();
      await pool`insert into workspace_number_release(id,workspace,number_id,number_created_at,number_type,phone_number,provider_sid,account_sid,state,lease_token,lease_expires_at,created_at,updated_at) values (${randomUUID()},${ws},${n.id},${n.createdAt},'rented',${n.phone},${n.sid},${account},'completed',${randomUUID()},'2026-10-01T00:00:00Z',${start},${end})`;
      await pool`delete from workspace_number where workspace=${ws} and id=${n.id}`;
    }
    async function purchaseHistory(
      n: Awaited<ReturnType<typeof number>>,
      ws: string,
      account: string,
    ) {
      const { pool } = await services();
      await pool`insert into workspace_number_purchase(id,workspace,actor_user_id,phone_number,account_sid,credits,state,provider_sid,lease_token,lease_expires_at) values (${randomUUID()},${ws},${ws === workspace ? owner : foreignOwner},${n.phone},${account},100,'completed',${n.sid},${randomUUID()},'2026-10-01T00:00:00Z')`;
    }
    async function runRentalSweep() {
      const s = await services();
      const result = await s.runNumberRentalBilling({
        workspaceId: workspace,
        today: new Date(now),
      });
      // JavaScript fake timers do not change the ledger RPC's database clock.
      await s.pool`update transaction_history set created_at=${now.toISOString()} where workspace=${workspace} and idempotency_key like 'number_rent:%'`;
      return result;
    }
    test("actual sweep catch-up pays September in October and reconciles by cycle", async () => {
      await number();
      fixture.units = 1;
      const s = await services();
      expect(await runRentalSweep()).toMatchObject({
        charged: 1,
        technicalFailures: 0,
      });
      const r = await reconcile();
      expect(r.report.categories.numbers).toMatchObject({
        variance: 0,
        ledgerEvents: 1,
        ledgerCredits: 100,
        twilioUnits: 1,
        period: { startDate: "2026-09-01", endDate: "2026-09-30" },
      });
      expect(r.normalized).toMatchObject({
        numbersVariance: 0,
        materialVariance: false,
      });
      expect(r.credits).toBe(9900);
      expect(
        await s.pool`select idempotency_key,amount from transaction_history where workspace=${workspace}`,
      ).toEqual([
        expect.objectContaining({
          amount: -100,
          idempotency_key: expect.stringContaining(":2026-09"),
        }),
      ]);
    });
    test("a debit after the captured timestamp stays outside the rental snapshot", async () => {
      const n = await number();
      fixture.units = 1;
      await debit(n.id);
      const { pool } = await services();
      await pool`update transaction_history set created_at='2026-10-06T13:00:00.000Z' where workspace=${workspace} and idempotency_key=${`number_rent:${n.id}:2026-09`}`;
      const r = await reconcile();
      expect(r.report.categories.numbers).toMatchObject({
        twilioUnits: 1,
        ledgerEvents: 0,
        ledgerCredits: 0,
        variance: 1,
      });
      expect(r.credits).toBe(9900);
    });
    test("a prior cycle paid during the rolling window does not move to September", async () => {
      const n = await number();
      fixture.units = 1;
      await debit(n.id);
      await debit(n.id, "2026-08");
      expect((await reconcile()).report.categories.numbers).toMatchObject({
        variance: 0,
        ledgerCredits: 100,
        ledgerEvents: 1,
      });
    });
    test("the first prepaid month stays separate while the cash total retains its debit", async () => {
      const n = await number("2026-09-12T12:00:00Z");
      fixture.units = 1;
      fixture.setups = 1;
      const { db, insertTransactionHistoryIdempotent } = await services();
      await insertTransactionHistoryIdempotent(db, {
        workspaceId: workspace,
        type: "DEBIT",
        amount: -100,
        note: "Rented number",
        idempotencyKey: `number_rent_purchase:${workspace}:${n.sid}`,
      });
      const r = await reconcile();
      expect(r.report.categories.numbers).toMatchObject({
        variance: 0,
        ledgerCredits: 0,
        ledgerEvents: 0,
      });
      expect(r.report.ledgerDebitCredits).toBe(100);
    });
    test("the existing grandfather exemption remains balanced without a debit", async () => {
      await number("2026-03-10T12:00:00Z");
      fixture.units = 1;
      const r = await reconcile();
      expect(r.normalized).toMatchObject({
        numbersVariance: 0,
        materialVariance: false,
      });
      expect(r.credits).toBe(10000);
    });
    test("saved release history retains the grandfather exemption after deletion", async () => {
      const n = await number("2026-03-10T12:00:00Z");
      await release(n);
      fixture.units = 1;
      expect((await reconcile()).report.categories.numbers.variance).toBe(0);
    });
    test("a release before September renewal does not subtract a nonexistent charge", async () => {
      const n = await number("2026-03-10T12:00:00Z");
      await release(n, "2026-09-05T10:00:00Z", "2026-09-05T10:01:00Z");
      expect((await reconcile()).report.categories.numbers.variance).toBe(0);
    });
    test("a release spanning the renewal remains unavailable and cannot clear drift", async () => {
      const n = await number("2026-03-10T12:00:00Z");
      await release(n, "2026-09-09T23:59:00Z", "2026-09-10T00:01:00Z");
      fixture.units = 1;
      const r = await reconcile();
      expect(r.normalized).toMatchObject({
        numbersVariance: null,
        materialVariance: true,
      });
      expect(r.data.billingReconciliationDriftAlert.numbersVariance).toBeNull();
    });
    test("foreign number, release and debit rows cannot change the owned result", async () => {
      const own = await number();
      fixture.units = 1;
      await debit(own.id);
      const other = await number("2026-03-10T12:00:00Z", foreign);
      await release(other, undefined, undefined, foreign);
      await debit(other.id, "2026-09", -500, foreign);
      await number("2026-08-10T12:00:00Z", foreign);
      const r = await reconcile();
      expect(r.normalized).toMatchObject({
        numbersVariance: 0,
        materialVariance: false,
      });
      expect(r.report.ledgerDebitCredits).toBe(100);
    });
    test("an overcharge produces negative drift rather than a balanced row count", async () => {
      const n = await number();
      fixture.units = 1;
      await debit(n.id, "2026-09", -500);
      const r = await reconcile();
      expect(r.normalized).toMatchObject({
        numbersVariance: -4,
        materialVariance: true,
      });
      expect(fixture.email).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Number rental variance: -4"),
          to: [`${owner}@example.test`],
        }),
      );
    });
    test("positive drift persists, suppresses repeat mail, clears, then re-arms", async () => {
      for (let i = 0; i < 3; i++) await number();
      fixture.units = 3;
      const first = await reconcile();
      expect(first.normalized).toMatchObject({
        numbersVariance: 3,
        numbersPeriod: { startDate: "2026-09-01", endDate: "2026-09-30" },
        materialVariance: true,
      });
      expect(first.data.billingReconciliationDriftAlert).toMatchObject({
        numbersVariance: 3,
      });
      expect(fixture.email).toHaveBeenCalledTimes(1);
      expect(fixture.log).toHaveBeenCalledWith(
        "billing_reconcile.material_variance",
        expect.objectContaining({
          workspaceId: workspace,
          numbersVariance: 3,
          numbersPeriod: { startDate: "2026-09-01", endDate: "2026-09-30" },
        }),
      );
      expect(fixture.email).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            "Rental period: 2026-09-01 – 2026-09-30",
          ),
          html: expect.stringContaining("Number rental variance: 3"),
        }),
      );
      const second = await reconcile();
      expect(second.data.billingReconciliationDriftAlert).toEqual(
        first.data.billingReconciliationDriftAlert,
      );
      expect(fixture.email).toHaveBeenCalledTimes(1);
      await runRentalSweep();
      const balanced = await reconcile();
      expect(balanced.normalized).toMatchObject({
        numbersVariance: 0,
        materialVariance: false,
      });
      expect(balanced.data.billingReconciliationDriftAlert).toBeUndefined();
      for (let i = 0; i < 3; i++) await number();
      fixture.units = 6;
      expect((await reconcile()).normalized?.numbersVariance).toBe(3);
      expect(fixture.email).toHaveBeenCalledTimes(2);
    });
    test("unknown debit identity stays unavailable after persistence", async () => {
      await debit(999999);
      const r = await reconcile();
      expect(r.normalized).toMatchObject({
        numbersVariance: null,
        materialVariance: true,
      });
    });
    test("an untracked provider rental cannot be recorded as numeric drift", async () => {
      fixture.units = 3;
      const r = await reconcile();
      expect(r.report.categories.numbers.variance).toBeNull();
      expect(r.normalized).toMatchObject({
        numbersVariance: null,
        materialVariance: true,
      });
    });
    test("a malformed cycle key is not silently dropped", async () => {
      const n = await number();
      fixture.units = 1;
      const { pool } = await services();
      await pool`insert into transaction_history(workspace,type,amount,idempotency_key,created_at) values (${workspace},'DEBIT',-100,${`number_rent:${n.id}:2026-13`},'2026-09-20T12:00:00Z')`;
      expect((await reconcile()).report.categories.numbers.variance).toBeNull();
    });
    test("unsupported rental units persist as unavailable with valid history and setup coverage", async () => {
      const n = await number();
      fixture.units = 1;
      fixture.rentalUnit = "number-months";
      await debit(n.id);
      const r = await reconcile();
      expect(r.normalized).toMatchObject({
        numbersVariance: null,
        materialVariance: true,
      });
      expect(r.data.billingReconciliationDriftAlert.numbersVariance).toBeNull();
      expect(fixture.email).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            "Number rental variance: Unavailable (rental coverage)",
          ),
        }),
      );
    });
    test("a rental read failure retains SMS drift and an explicit unavailable rental snapshot", async () => {
      fixture.rentalReadFails = true;
      fixture.smsUnits = 3;
      const r = await reconcile();
      expect(r.report.categories.numbers.comparisonIssue).toBe(
        "Rental usage could not be loaded for this period.",
      );
      expect(r.normalized).toMatchObject({
        smsVariance: 3,
        numbersVariance: null,
        materialVariance: true,
      });
      expect(fixture.log).toHaveBeenCalledWith(
        "billing_reconcile.rental_usage_unavailable",
        {
          workspaceId: workspace,
          period: { startDate: "2026-09-01", endDate: "2026-09-30" },
        },
      );
      expect(fixture.email).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("SMS variance: 3"),
          to: [`${owner}@example.test`],
        }),
      );
    });
    test("an active rental without a provider identity cannot appear balanced", async () => {
      const n = await number();
      fixture.units = 1;
      await debit(n.id);
      const { pool } = await services();
      await pool`update workspace_number set twilio_phone_number_sid='invalid' where workspace=${workspace} and id=${n.id}`;
      const r = await reconcile();
      expect(r.report.categories.numbers.comparisonIssue).toBe(
        "An active rental has no provider identity.",
      );
      expect(r.normalized?.numbersVariance).toBeNull();
    });
    test("a release from a different provider account cannot offset current-account usage", async () => {
      const n = await number("2026-03-10T12:00:00Z");
      await release(n, undefined, undefined, workspace, fixture.foreignAccount);
      fixture.units = 1;
      const r = await reconcile();
      expect(r.normalized).toMatchObject({
        numbersVariance: null,
        materialVariance: true,
      });
    });
    test("an active rental purchased under an old account cannot appear balanced", async () => {
      const n = await number();
      await purchaseHistory(n, workspace, fixture.foreignAccount);
      fixture.units = 1;
      await debit(n.id);
      const r = await reconcile();
      expect(r.report.categories.numbers.comparisonIssue).toBe(
        "An active rental was purchased under another provider account.",
      );
      expect(r.normalized?.numbersVariance).toBeNull();
    });
    test("foreign purchase history cannot make a valid owned rental unavailable", async () => {
      const n = await number();
      await purchaseHistory(n, foreign, fixture.foreignAccount);
      fixture.units = 1;
      await debit(n.id);
      expect((await reconcile()).normalized).toMatchObject({
        numbersVariance: 0,
        materialVariance: false,
      });
    });
    test("aggregate usage with zero setups and no subtype cannot clear a persisted drift episode", async () => {
      for (let i = 0; i < 3; i++) await number();
      fixture.units = 3;
      const first = await reconcile();
      expect(first.normalized?.numbersVariance).toBe(3);
      const { pool } = await services();
      await pool`delete from workspace_number where workspace=${workspace}`;
      fixture.aggregateOnly = true;
      const next = await reconcile();
      expect(next.normalized).toMatchObject({
        numbersVariance: null,
        materialVariance: true,
      });
      expect(next.data.billingReconciliationDriftAlert).toEqual(
        first.data.billingReconciliationDriftAlert,
      );
      expect(fixture.email).toHaveBeenCalledTimes(1);
    });
  },
);
