import { beforeEach, describe, expect, test, vi } from "vitest";

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
  const rows: Array<{
    id: number;
    workspace: string;
    type: string;
    amount: number;
    note: string;
    idempotency_key?: string;
    created_at: string;
  }> = [];
  let nextId = 1;

  return {
    rows,
    from: (table: string) => {
      if (table !== "transaction_history") {
        throw new Error(`unexpected table ${table}`);
      }

      const builder: any = {};
      builder.insert = (row: any) => ({
        select: () => ({
          single: async () => {
            const dup = rows.some(
              (r) =>
                r.workspace === row.workspace &&
                r.type === row.type &&
                r.idempotency_key === row.idempotency_key,
            );
            if (dup) {
              return { data: null, error: { code: "23505" } };
            }
            const inserted = {
              id: nextId++,
              ...row,
              created_at: new Date().toISOString(),
            };
            rows.push(inserted);
            return { data: { id: inserted.id }, error: null };
          },
        }),
      });
      builder.select = () => {
        const filters: Record<string, string> = {};
        const chain: any = {};
        chain.eq = (column: string, value: unknown) => {
          filters[column] = String(value);
          return chain;
        };
        chain.like = (_column: string, pattern: string) => {
          filters.likeNote = pattern.replace(/^%/, "").replace(/%$/, "");
          return chain;
        };
        chain.order = () => chain;
        chain.limit = () => ({
          maybeSingle: async () => {
            let matches = rows.filter((row) => {
              if (filters.workspace && row.workspace !== filters.workspace) return false;
              if (filters.type && row.type !== filters.type) return false;
              if (filters.idempotency_key && row.idempotency_key !== filters.idempotency_key)
                return false;
              if (filters.likeNote && !row.note.includes(filters.likeNote)) return false;
              return true;
            });
            matches = [...matches].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
            const hit = matches[matches.length - 1];
            return { data: hit ? { id: hit.id } : null, error: null };
          },
        });
        return chain;
      };
      return builder;
    },
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

    const mod = await import("../app/routing/public/confirm-payment");
    const request = new Request(
      "http://localhost/confirm-payment?session_id=sess_123",
    );

    const first = await mod.loader({ request } as any);
    const second = await mod.loader({ request } as any);

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
    };

    const mod = await import("../app/routing/public/confirm-payment");
    const response = await mod.loader({
      request: new Request("http://localhost/confirm-payment?session_id=sess_123"),
    } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/workspaces/w1/billing?payment_status=error&payment_message=We+could+not+confirm+this+payment+yet.+If+your+card+was+charged%2C+please+contact+support.",
    );
    expect(loggerError).toHaveBeenCalled();
  }, 30000);
});
