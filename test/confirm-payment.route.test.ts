import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import {
  makeApplyLedgerEntryRpcStub,
  makeTransactionHistoryTableStub,
  type TransactionRow,
} from "./helpers/transaction-history-stub";

vi.mock("@/lib/env.server", () => {
  const handler = { get: (_target: unknown, prop: string) => () => `test-${prop}` };
  return { env: new Proxy({}, handler) };
});

const stripeRetrieve = vi.fn();
const loggerError = vi.fn();
const stripeCtor = vi.fn(function StripeMock(this: any) {
  return {
    checkout: {
      sessions: {
        retrieve: stripeRetrieve,
      },
    },
  };
});

vi.mock("stripe", () => ({
  default: stripeCtor,
}));

vi.mock("@/lib/logger.server", () => ({
  logger: {
    error: loggerError,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

let supabaseClient: any;

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: vi.fn(async () => ({ supabaseClient })),
}));

function makeSupabaseStub() {
  const rows: TransactionRow[] = [];

  return {
    rows,
    from: (table: string) => {
      if (table !== "transaction_history") {
        throw new Error(`unexpected table ${table}`);
      }
      return makeTransactionHistoryTableStub(rows);
    },
    rpc: makeApplyLedgerEntryRpcStub(rows),
  };
}

describe("confirm-payment route", () => {
  beforeEach(() => {
    stripeCtor.mockClear();
    stripeRetrieve.mockReset();
    loggerError.mockReset();
    supabaseClient = makeSupabaseStub();
  });

  test("records credits once across duplicate session confirmations", async () => {
    stripeRetrieve.mockResolvedValue({
      status: "complete",
      metadata: {
        workspaceId: "w1",
        creditAmount: "250",
      },
    });

    const mod = await import("../app/routes/confirm-payment");
    const request = new Request(
      "http://localhost/confirm-payment?session_id=sess_123",
    );

    const first = await asRouteResponse(await mod.loader({ request } as any));
    const second = await asRouteResponse(await mod.loader({ request } as any));

    expect(first.status).toBe(302);
    expect(second.status).toBe(302);
    expect(first.headers.get("Location")).toBe("/workspaces/w1/billing?payment_status=success&credits_added=250");
    expect(second.headers.get("Location")).toBe("/workspaces/w1/billing?payment_status=success&credits_added=250");
    expect(supabaseClient.rows).toHaveLength(1);
    expect(supabaseClient.rows[0].note).toContain("stripe_session:sess_123");
  }, 30000);

  test("redirects to workspace billing error when insert fails", async () => {
    stripeRetrieve.mockResolvedValue({
      status: "complete",
      metadata: {
        workspaceId: "w1",
        creditAmount: "250",
      },
    });

    supabaseClient = {
      from: () => {
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.like = () => builder;
        builder.order = () => builder;
        builder.limit = async () => ({ data: [], error: null });
        builder.insert = () => ({
          select: () => ({
            single: async () => ({ data: null, error: new Error("insert failed") }),
          }),
        });
        return builder;
      },
      rpc: async () => ({ data: null, error: new Error("rpc failed") }),
    };

    const mod = await import("../app/routes/confirm-payment");
    const response = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/confirm-payment?session_id=sess_123"),
    } as any));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/workspaces/w1/billing?payment_status=error&payment_message=We+could+not+confirm+this+payment+yet.+If+your+card+was+charged%2C+please+contact+support.",
    );
    expect(loggerError).toHaveBeenCalled();
  }, 30000);
});
