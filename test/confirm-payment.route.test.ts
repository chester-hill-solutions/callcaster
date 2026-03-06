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
  const rows: Array<{ id: number; workspace: string; type: string; amount: number; note: string }> = [];
  let nextId = 1;

  return {
    rows,
    from: (table: string) => {
      if (table !== "transaction_history") {
        throw new Error(`unexpected table ${table}`);
      }

      const query: { workspace?: string; type?: string; noteMarker?: string } = {};
      const builder: any = {};
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        if (column === "workspace") query.workspace = String(value);
        if (column === "type") query.type = String(value);
        return builder;
      };
      builder.like = (_column: string, pattern: string) => {
        query.noteMarker = pattern.replace(/^%/, "").replace(/%$/, "");
        return builder;
      };
      builder.order = () => builder;
      builder.limit = async () => {
        const matches = rows.filter((row) => {
          if (query.workspace && row.workspace !== query.workspace) return false;
          if (query.type && row.type !== query.type) return false;
          if (query.noteMarker && !row.note.includes(query.noteMarker)) return false;
          return true;
        });
        return {
          data: matches.length ? [{ id: matches[matches.length - 1].id }] : [],
          error: null,
        };
      };
      builder.insert = (row: any) => ({
        select: () => ({
          single: async () => {
            const inserted = { id: nextId++, ...row };
            rows.push(inserted);
            return { data: { id: inserted.id }, error: null };
          },
        }),
      });
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

    const mod = await import("../app/routes/confirm-payment");
    const request = new Request(
      "http://localhost/confirm-payment?session_id=sess_123",
    );

    const first = await mod.loader({ request } as any);
    const second = await mod.loader({ request } as any);

    expect(first.status).toBe(302);
    expect(second.status).toBe(302);
    expect(first.headers.get("Location")).toBe("/workspaces/w1/billing?success=true");
    expect(second.headers.get("Location")).toBe("/workspaces/w1/billing?success=true");
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

    const mod = await import("../app/routes/confirm-payment");
    const response = await mod.loader({
      request: new Request("http://localhost/confirm-payment?session_id=sess_123"),
    } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/workspaces/w1/billing?error=true");
    expect(loggerError).toHaveBeenCalled();
  }, 30000);
});
