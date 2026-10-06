import { usageRecordPage } from "../helpers/twilio-usage-page";
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
  return { list: vi.fn(), workspaces: [] as string[], drift: vi.fn() };
});
vi.mock("@/lib/database/workspace.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/database/workspace.server")>();
  return {
    ...actual,
    getWorkspaceTwilioPortalSnapshot: async () =>
      actual.buildDefaultWorkspaceTwilioPortalSnapshot(),
    createWorkspaceTwilioInstance: async (args: { workspace_id: string }) => {
      provider.workspaces.push(args.workspace_id);
      return {
        api: {
          v2010: {
            accounts: () => ({
              fetch: async () => ({
                sid: "ACfixture",
                friendlyName: "Fixture",
                status: "active",
                type: "Full",
                dateCreated: new Date("2026-01-01"),
              }),
            }),
          },
        },
        incomingPhoneNumbers: { list: async () => [] },
        usage: {
          records: {
            list: provider.list,
            page: async ({
              pageSize,
              ...args
            }: {
              pageSize?: number;
              startDate?: Date;
              endDate?: Date;
            }) =>
              usageRecordPage(
                (
                  await provider.list({
                    ...args,
                    ...(pageSize === undefined ? {} : { limit: pageSize }),
                  })
                ).map(
                  (record: {
                    category: string;
                    description: string;
                    usage: string;
                    usageUnit: string;
                    price: number;
                    startDate?: Date;
                    endDate?: Date;
                  }) => ({
                    category: record.category,
                    description: record.description,
                    usage: record.usage,
                    usage_unit: record.usageUnit,
                    price: record.price,
                    start_date: record.startDate?.toISOString().slice(0, 10),
                    end_date: record.endDate?.toISOString().slice(0, 10),
                  }),
                ),
              ),
          },
        },
      };
    },
  };
});
vi.mock(
  "@/lib/billing-reconciliation-alert.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/billing-reconciliation-alert.server")
    >()),
    handleBillingReconciliationDrift: provider.drift,
  }),
);

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = randomUUID();
const foreign = randomUUID();
const now = new Date("2026-10-05T12:00:00.000Z");
const surfaces = ["loader", "form", "api-service"] as const;
type Surface = (typeof surfaces)[number];

suite("admin billing uses one provider/ledger period (#2412)", () => {
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
      ...(await import("@/lib/merge-workspace-twilio-data.server")),
      ...(await import("@/lib/billing-reconciliation-snapshot.server")),
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
    vi.setSystemTime(now);
    await cleanup();
    const { pool } = await services();
    for (const id of [workspace, foreign]) {
      await pool`insert into workspace (id, name, credits, twilio_data) values (${id}, 'Admin period fixture', 1000, ${JSON.stringify({ sid: "ACfixture", authToken: "fixture-only", unrelated: "retained" })}::jsonb)`;
    }
    provider.workspaces.length = 0;
    provider.list.mockReset();
    provider.drift.mockReset();
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
  async function debit(date: string, id = workspace) {
    const sid = `SM${randomUUID().replaceAll("-", "")}`;
    const { pool } = await services();
    await pool`insert into message (sid, workspace, status, direction, body, "from", "to", num_segments, num_media, date_created)
      values (${sid}, ${id}, 'delivered', 'outbound-api', 'Fixture', '+15555550111', '+15555550112', '1', '0', ${date})`;
    await pool`insert into transaction_history (workspace, type, amount, idempotency_key, note, message_sid, created_at)
      values (${id}, 'DEBIT', -2, ${`sms:${sid}`}, ${`SMS ${sid} delivered`}, ${sid}, ${date})`;
  }
  function usageTraffic(
    traffic: { date: string; segments: number }[],
    crossMidnight = false,
  ) {
    provider.list.mockImplementation(
      async (args?: { startDate?: Date; endDate?: Date }) => {
        const start = args?.startDate?.toISOString().slice(0, 10);
        const end = args?.endDate?.toISOString().slice(0, 10);
        const quantity = traffic
          .filter((x) => (!start || x.date >= start) && (!end || x.date <= end))
          .reduce((sum, x) => sum + x.segments, 0);
        if (crossMidnight)
          vi.setSystemTime(new Date("2026-10-06T00:00:01.000Z"));
        return [
          {
            category: "sms-outbound",
            description: "Outbound SMS",
            usage: String(quantity),
            usageUnit: "messages",
            price: 0.01,
            startDate: args?.startDate,
            endDate: args?.endDate,
          },
        ];
      },
    );
  }
  async function saved() {
    const { pool, getWorkspaceBillingReconciliationSnapshot } =
      await services();
    const [row] =
      await pool`select twilio_data from workspace where id = ${workspace}`;
    expect(row.twilio_data.unrelated).toBe("retained");
    return getWorkspaceBillingReconciliationSnapshot(row.twilio_data);
  }
  async function run(surface: Surface, contextMissing = false) {
    if (surface === "loader") {
      const { loadTwilioData } =
        await import("@/routes/admin+/workspaces/$workspaceId/loadTwilioData.server");
      const result = await loadTwilioData(workspace);
      return {
        status: 200,
        report: result.billingReconciliation,
        snapshot: await saved(),
        body: result,
      };
    }
    if (surface === "form") {
      const { asRouteResponse } = await import("../helpers/route-result");
      const { createRouteContextProvider, withAdminRouteArgs } =
        await import("../helpers/route-context-mock");
      const { action } =
        await import("@/routes/admin+/workspaces/$workspaceId/twilio.actions.server");
      const body = new FormData();
      body.set("_action", "run_billing_reconciliation");
      const args = await withAdminRouteArgs({
        request: new Request("http://fixture/admin", { method: "POST", body }),
        params: { workspaceId: workspace },
      });
      if (contextMissing)
        args.context = await createRouteContextProvider({ admin: null });
      const result = await asRouteResponse(action(args));
      return {
        status: result.status,
        report: null,
        snapshot: await saved(),
        body: await result.json(),
      };
    }
    const { dispatchAdminTwilioAction } =
      await import("@/lib/platform-admin-twilio.server");
    const result = await dispatchAdminTwilioAction({
      workspaceId: workspace,
      actorUserId: "fixture-admin",
      actorUsername: "fixture@example.invalid",
      actionName: "run_billing_reconciliation",
    });
    return {
      status: result.ok ? 200 : result.status,
      report: null,
      snapshot: await saved(),
      body: result,
    };
  }
  for (const surface of surfaces) {
    describe(surface, () => {
      test("old provider activity and foreign debits do not create drift", async () => {
        await debit("2026-10-01T12:00:00.000Z");
        await debit("2026-08-01T12:00:00.000Z");
        await debit("2026-10-01T12:00:00.000Z", foreign);
        usageTraffic([
          { date: "2026-08-01", segments: 12 },
          { date: "2026-10-01", segments: 1 },
        ]);
        const result = await run(surface);
        expect(result.status).toBe(200);
        expect(provider.list).toHaveBeenCalledWith({
          startDate: new Date("2026-09-05"),
          endDate: new Date("2026-10-05"),
          ...(surface === "loader" ? { limit: 200 } : {}),
        });
        const report = surface === "loader" ? result.report : result.snapshot;
        if (surface === "loader") {
          expect(report?.categories.sms.variance).toBe(0);
          expect(report?.ledgerDebitCredits).toBe(2);
          expect(result.snapshot).toBeNull();
        } else {
          expect(report).toMatchObject({
            smsVariance: 0,
            materialVariance: false,
            lastRunSource: "admin",
            period: { startDate: "2026-09-05", endDate: "2026-10-05" },
          });
        }
        expect(provider.list).toHaveBeenCalledWith({
          startDate: new Date("2026-09-01"),
          endDate: new Date("2026-09-30"),
          includeSubaccounts: false,
        });
        expect(provider.workspaces).toEqual([workspace, workspace]);
        expect(provider.drift).not.toHaveBeenCalled();
      });
      test("one captured window survives a provider response after midnight", async () => {
        vi.setSystemTime(new Date("2026-10-05T23:59:59.000Z"));
        await debit("2026-09-05T12:00:00.000Z");
        await debit("2026-10-05T12:00:00.000Z");
        usageTraffic(
          [
            { date: "2026-09-05", segments: 1 },
            { date: "2026-10-05", segments: 1 },
          ],
          true,
        );
        const result = await run(surface);
        expect(result.status).toBe(200);
        if (surface === "loader") {
          expect(result.report?.period).toEqual({
            startDate: "2026-09-05",
            endDate: "2026-10-05",
          });
          expect(result.report?.categories.sms.variance).toBe(0);
        } else
          expect(result.snapshot).toMatchObject({
            smsVariance: 0,
            period: { startDate: "2026-09-05", endDate: "2026-10-05" },
          });
      });
      test("current usage drift stays visible without adding a notification", async () => {
        await debit("2026-10-01T12:00:00.000Z");
        usageTraffic([{ date: "2026-10-01", segments: 7 }]);
        const result = await run(surface);
        expect(result.status).toBe(200);
        if (surface === "loader")
          expect(result.report?.categories.sms.variance).toBe(6);
        else
          expect(result.snapshot).toMatchObject({
            smsVariance: 6,
            materialVariance: true,
            lastRunSource: "admin",
          });
        expect(provider.drift).not.toHaveBeenCalled();
      });
      test("provider failure cannot persist a success snapshot", async () => {
        provider.list.mockRejectedValue(new Error("Fixture provider failure"));
        const result = await run(surface);
        expect(result.status).toBe(surface === "loader" ? 200 : 500);
        if (surface === "loader") expect(result.report).toBeNull();
        else expect(result.body).not.toHaveProperty("success");
        expect(result.snapshot).toBeNull();
        expect(provider.drift).not.toHaveBeenCalled();
      });
      test("missing credentials stop the provider request", async () => {
        const { pool, invalidateWorkspaceTwilioData } = await services();
        await pool`update workspace set twilio_data = ${JSON.stringify({ unrelated: "retained" })}::jsonb where id = ${workspace}`;
        invalidateWorkspaceTwilioData(workspace);
        const result = await run(surface);
        expect(result.status).toBe(surface === "loader" ? 200 : 400);
        expect(provider.list).not.toHaveBeenCalled();
        expect(result.snapshot).toBeNull();
      });
    });
  }
  test("missing admin context stops the form action before provider or ledger work", async () => {
    const result = await run("form", true);
    expect(result.status).toBe(500);
    expect(provider.list).not.toHaveBeenCalled();
    expect(result.snapshot).toBeNull();
  });
});
