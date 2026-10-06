import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildBillingReconciliationReport,
  buildBillingReconciliationSnapshot,
  type BillingReconciliationReport,
  type TwilioUsageRecord,
} from "../shared/billing-reconciliation";
import { asRouteResponse } from "./helpers/route-result";
import { withAdminRouteArgs } from "./helpers/route-context-mock";

const boundary = vi.hoisted(() => {
  vi.stubEnv("TZ", "UTC");
  return {
    list: vi.fn(),
    report:
      vi.fn<
        (args: {
          twilioUsage: TwilioUsageRecord[];
          referenceDate: Date;
        }) => Promise<BillingReconciliationReport>
      >(),
    snapshot: vi.fn(),
    drift: vi.fn(),
  };
});
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async () => ({
    api: {
      v2010: {
        accounts: () => ({
          fetch: async () => ({
            sid: "ACfixture",
            status: "active",
            friendlyName: "Fixture",
            type: "Full",
            dateCreated: new Date("2026-01-01"),
          }),
        }),
      },
    },
    incomingPhoneNumbers: { list: async () => [] },
    usage: { records: { list: boundary.list } },
  }),
  getWorkspaceTwilioPortalSnapshot: async () => null,
}));
vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/workspace-members-db.server")
  >()),
  getWorkspaceById: async () => ({
    id: "cost-fixture",
    twilio_data: { sid: "ACfixture", authToken: "owned-fixture" },
  }),
}));
vi.mock("@/lib/merge-workspace-twilio-data.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/merge-workspace-twilio-data.server")
  >()),
  loadWorkspaceTwilioData: async () => ({
    sid: "ACfixture",
    authToken: "owned-fixture",
  }),
}));
vi.mock("@/lib/billing-reconciliation.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/billing-reconciliation.server")
  >()),
  loadBillingReconciliationReport: boundary.report,
}));
vi.mock(
  "@/lib/billing-reconciliation-snapshot.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/billing-reconciliation-snapshot.server")
    >()),
    persistWorkspaceBillingReconciliationSnapshot: boundary.snapshot,
  }),
);
vi.mock(
  "@/lib/billing-reconciliation-alert.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/billing-reconciliation-alert.server")
    >()),
    handleBillingReconciliationDrift: boundary.drift,
  }),
);

const period = { startDate: "2026-09-06", endDate: "2026-10-06" };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
  boundary.report.mockReset();
  boundary.snapshot.mockReset();
  boundary.drift.mockReset();
  boundary.list.mockReset();
  boundary.report.mockImplementation(async ({ twilioUsage }) =>
    buildBillingReconciliationReport({
      period,
      twilioUsage,
      ledgerRows: [],
      entityAudit: {
        billableMessages: 0,
        debitedMessages: 0,
        messageGap: 0,
        billableCalls: 0,
        debitedCalls: 0,
        callGap: 0,
        billedVoiceMinutes: 0,
      },
      numberRentals: {
        period: { startDate: "2026-09-01", endDate: "2026-09-30" },
        twilioUsage: [],
        ledgerRows: [],
        history: [],
      },
    }),
  );
  boundary.snapshot.mockImplementation(async ({ report }) =>
    buildBillingReconciliationSnapshot(report, "admin"),
  );
});

afterEach(() => vi.useRealTimers());
afterAll(() => vi.unstubAllEnvs());

const surfaces = [
  {
    name: "worker",
    run: async () => {
      const { reconcileWorkspaceBilling } =
        await import("@/lib/billing-reconcile-workspace.server");
      await reconcileWorkspaceBilling({
        workspaceId: "cost-fixture",
        source: "cron",
      });
    },
  },
  {
    name: "admin loader",
    run: async () => {
      const { loadTwilioData } =
        await import("@/routes/admin+/workspaces/$workspaceId/loadTwilioData.server");
      const result = await loadTwilioData("cost-fixture");
      expect(result.billingReconciliation).not.toBeNull();
    },
  },
  {
    name: "admin form",
    run: async () => {
      const { action } =
        await import("@/routes/admin+/workspaces/$workspaceId/twilio.actions.server");
      const body = new FormData();
      body.set("_action", "run_billing_reconciliation");
      const args = await withAdminRouteArgs({
        request: new Request("http://fixture/admin", { method: "POST", body }),
        params: { workspaceId: "cost-fixture" },
      });
      const result = await asRouteResponse(action(args));
      expect(result.status).toBe(200);
      expect(await result.json()).toHaveProperty("success");
    },
  },
  {
    name: "admin API service",
    run: async () => {
      const { dispatchAdminTwilioAction } =
        await import("@/lib/platform-admin-twilio.server");
      const result = await dispatchAdminTwilioAction({
        workspaceId: "cost-fixture",
        actorUserId: "fixture-admin",
        actorUsername: "fixture@example.invalid",
        actionName: "run_billing_reconciliation",
      });
      expect(result.ok).toBe(true);
    },
  },
];
for (const surface of surfaces) {
  describe(`${surface.name} provider monetary boundary (#2426)`, () => {
    test.each([
      { name: "USD total", price: 4.2, priceUnit: "usd", expected: 4.2 },
      {
        name: "different currency",
        price: 4.2,
        priceUnit: "eur",
        expected: null,
      },
      {
        name: "missing price",
        price: undefined,
        priceUnit: "usd",
        expected: null,
      },
      { name: "zero total", price: 0, priceUnit: "usd", expected: 0 },
    ])(
      "retains $name through the real adapter and cost builder",
      async ({ price, priceUnit, expected }) => {
        boundary.list.mockResolvedValue([
          {
            category: "totalprice",
            description: "All usage",
            usage: "4.20",
            usageUnit: "usd",
            price,
            priceUnit,
            startDate: new Date("2026-09-06"),
            endDate: new Date("2026-10-06"),
          },
        ]);
        await surface.run();
        expect(boundary.report).toHaveBeenCalledTimes(1);
        const call = boundary.report.mock.calls[0];
        if (!call)
          throw new Error("The adapter did not reach the report builder");
        expect(call[0].twilioUsage[0]).toMatchObject({
          price: price === undefined ? "" : String(price),
          priceUnit,
          startDate: "2026-09-06T00:00:00.000Z",
          endDate: "2026-10-06T00:00:00.000Z",
        });
        const returned = boundary.report.mock.results[0];
        if (!returned) throw new Error("Missing actual report result");
        expect((await returned.value).twilioTotalCostUsd).toBe(expected);
      },
    );
  });
}
