import { beforeEach, describe, expect, test, vi } from "vitest";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const twilioValidateRequest = vi.fn(() => true);
vi.mock("twilio", () => {
  class TwilioClientMock {}
  return {
    default: {
      validateRequest: twilioValidateRequest,
      Twilio: TwilioClientMock,
    },
  };
});

type TransactionRow = {
  id: number;
  workspace: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  note: string;
  idempotency_key?: string;
  created_at: string;
};

function makeSupabaseStub(args?: { currentOutreachDisposition?: string }) {
  let nextId = 1;
  const transactionRows: TransactionRow[] = [];
  const outreachUpdateCalls: any[] = [];
  const messageUpdateCalls: any[] = [];

  const from = (table: string) => {
    if (table === "message") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { workspace: "w1" },
              error: null,
            }),
          }),
        }),
        update: (patch: any) => ({
          eq: (_col: string, _val: string) => ({
            select: () => ({
              single: async () => {
                messageUpdateCalls.push(patch);
                return {
                  data: {
                    sid: "SM123",
                    workspace: "w1",
                    outreach_attempt_id: 7,
                    from: "+15555550100",
                    to: "+15555550101",
                    body: "hello",
                    num_media: 0,
                    status: patch.status,
                    date_updated: new Date().toISOString(),
                  },
                  error: null,
                };
              },
            }),
          }),
        }),
      };
    }

    if (table === "workspace") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { twilio_data: { authToken: "workspace-token" } },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "outreach_attempt") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { disposition: args?.currentOutreachDisposition ?? "delivered" },
              error: null,
            }),
          }),
        }),
        update: (patch: any) => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                outreachUpdateCalls.push(patch);
                return { data: { ...patch }, error: null };
              },
            }),
          }),
        }),
      };
    }

    if (table === "webhook") {
      const builder: any = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.filter = () => builder;
      builder.then = (resolve: any, reject: any) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject);
      return builder;
    }

    if (table === "transaction_history") {
      const selectBuilder: any = {};
      selectBuilder.insert = (row: any) => ({
        select: () => ({
          single: async () => {
            const dup = transactionRows.some(
              (r) =>
                r.workspace === row.workspace &&
                r.type === row.type &&
                r.idempotency_key === row.idempotency_key,
            );
            if (dup) {
              return { data: null, error: { code: "23505" } };
            }
            const created = {
              id: nextId++,
              workspace: row.workspace,
              type: row.type,
              amount: row.amount,
              note: row.note,
              idempotency_key: row.idempotency_key,
              created_at: new Date().toISOString(),
            } satisfies TransactionRow;
            transactionRows.push(created);
            return { data: { id: created.id }, error: null };
          },
        }),
      });
      selectBuilder.select = () => {
        const filters: Record<string, string> = {};
        const chain: any = {};
        chain.eq = (col: string, val: any) => {
          filters[col] = String(val);
          return chain;
        };
        chain.like = (_col: string, pattern: string) => {
          filters.likeNote = pattern.replace(/^%/, "").replace(/%$/, "");
          return chain;
        };
        chain.order = () => chain;
        chain.limit = () => ({
          maybeSingle: async () => {
            let filtered = transactionRows.filter((r) => {
              if (filters.workspace && r.workspace !== filters.workspace) return false;
              if (filters.type && r.type !== filters.type) return false;
              if (filters.idempotency_key && r.idempotency_key !== filters.idempotency_key)
                return false;
              if (filters.likeNote && !r.note.includes(filters.likeNote)) return false;
              return true;
            });
            filtered = [...filtered].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
            const hit = filtered[filtered.length - 1];
            return { data: hit ? { id: hit.id } : null, error: null };
          },
        });
        return chain;
      };
      return selectBuilder;
    }

    throw new Error(`unexpected table ${table}`);
  };

  return {
    from,
    _transactionRows: transactionRows,
    _outreachUpdateCalls: outreachUpdateCalls,
    _messageUpdateCalls: messageUpdateCalls,
  };
}

let supabaseStub: ReturnType<typeof makeSupabaseStub>;
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: () => supabaseStub as any,
  };
});

describe("api.sms.status webhook behavior", () => {
  beforeEach(() => {
    supabaseStub = makeSupabaseStub({ currentOutreachDisposition: "delivered" });
    twilioValidateRequest.mockReset();
    twilioValidateRequest.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
  });

  test("accepts webhook while Twilio signature validation is stubbed off", async () => {
    twilioValidateRequest.mockReturnValueOnce(false);
    const mod = await import("../app/routing/api/api.sms.status");
    const fd = new FormData();
    fd.set("SmsSid", "SM_BAD");
    fd.set("SmsStatus", "delivered");
    const req = new Request("http://localhost/api/sms/status", {
      method: "POST",
      headers: { "x-twilio-signature": "bad" },
      body: fd,
    });

    const res = await mod.action({ request: req } as any);
    expect(res.status).toBe(200);
  }, 15000);

  test("normalizes unknown SmsStatus to failed", async () => {
    const mod = await import("../app/routing/api/api.sms.status");
    const fd = new FormData();
    fd.set("SmsSid", "SM123");
    fd.set("SmsStatus", "not-a-real-status");
    const req = new Request("http://localhost/api/sms/status", {
      method: "POST",
      headers: { "x-twilio-signature": "good" },
      body: fd,
    });

    const res = await mod.action({ request: req } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message.status).toBe("failed");
    expect(supabaseStub._messageUpdateCalls.at(-1)).toMatchObject({
      status: "failed",
    });
  });

  test("does not overwrite terminal outreach disposition", async () => {
    // delivered -> failed should be skipped
    const mod = await import("../app/routing/api/api.sms.status");
    const fd = new FormData();
    fd.set("SmsSid", "SM123");
    fd.set("SmsStatus", "failed");
    const req = new Request("http://localhost/api/sms/status", {
      method: "POST",
      headers: { "x-twilio-signature": "good" },
      body: fd,
    });

    const res = await mod.action({ request: req } as any);
    expect(res.status).toBe(200);
    expect(supabaseStub._outreachUpdateCalls.length).toBe(0);
  });

  test("bills only once for duplicate deliveries (same SmsSid)", async () => {
    const mod = await import("../app/routing/api/api.sms.status");
    const makeReq = () => {
      const fd = new FormData();
      fd.set("SmsSid", "SM_DUP");
      fd.set("SmsStatus", "delivered");
      return new Request("http://localhost/api/sms/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      });
    };

    await mod.action({ request: makeReq() } as any);
    await mod.action({ request: makeReq() } as any);

    const matching = supabaseStub._transactionRows.filter(
      (r) => r.idempotency_key === "sms:SM_DUP",
    );
    expect(matching.length).toBe(1);
  });
});

