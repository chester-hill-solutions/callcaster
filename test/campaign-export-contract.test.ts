import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const requireWorkspaceAccess = vi.fn(async () => undefined);
vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database.server")>(
    "@/lib/database.server",
  );
  return { ...actual, requireWorkspaceAccess };
});

type UploadRecord = {
  path: string;
  bytes: Uint8Array;
  text: string;
  contentType?: string;
};
let uploads: UploadRecord[] = [];

vi.mock("@/lib/supabase.server", () => {
  return {
    verifyAuth: vi.fn(async () => {
      const supabaseClient: any = {};

      supabaseClient.storage = {
        from: () => ({
          upload: async (path: string, data: any, opts?: any) => {
            if (path.endsWith(".csv")) {
              const bytes =
                typeof data === "string"
                  ? new TextEncoder().encode(data)
                  : data instanceof Blob
                    ? new Uint8Array(await data.arrayBuffer())
                    : new TextEncoder().encode(String(data));
              const text = new TextDecoder("utf-8").decode(bytes);
              uploads.push({
                path,
                bytes,
                text,
                contentType: opts?.contentType,
              });
            }
            return { data: null, error: null };
          },
          createSignedUrl: async () => ({
            data: { signedUrl: "http://signed.example" },
            error: null,
          }),
        }),
      };

      const campaignRow = {
        id: 123,
        type: "message",
        title: "TestCampaign",
        workspace: "w1",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-01-02T00:00:00.000Z",
      };

      const contactRow = {
        id: 1,
        firstname: "=1+1",
        surname: "Smith",
        phone: "+15555550101",
        email: "a@example.com",
        address: "1 Main St",
        city: "Town",
        opt_out: false,
        created_at: "2026-01-01T00:00:00.000Z",
        workspace: "w1",
      };

      const messageRow = {
        id: "m1",
        body: "hello",
        from: "+15555550101",
        to: "+15555550102",
        direction: "outbound-api",
        status: "delivered",
        date_created: "2026-01-01T00:00:00.000Z",
        date_sent: "2026-01-01T00:00:00.000Z",
        workspace: "w1",
      };

      supabaseClient.from = (table: string) => {
        if (table === "campaign") {
          const builder: any = {};
          builder.select = () => builder;
          builder.eq = () => builder;
          builder.single = async () => ({ data: campaignRow, error: null });
          return builder;
        }

        if (table === "campaign_queue") {
          return {
            select: () => ({
              eq: async () => ({ data: [{ contact_id: 1 }], error: null }),
            }),
          };
        }

        if (table === "contact") {
          const builder: any = {};
          builder.select = () => builder;
          builder.in = () => builder;
          builder.eq = async () => ({ data: [contactRow], error: null });
          return builder;
        }

        if (table === "message") {
          const builder: any = {};
          builder.select = (_cols: any, opts?: any) => {
            builder._selectOpts = opts;
            return builder;
          };
          builder.eq = () => builder;
          builder.gte = () => builder;
          builder.lte = () => builder;
          builder.order = () => builder;
          builder.range = async () => ({ data: [messageRow], error: null });
          builder.then = (resolve: any, reject: any) =>
            Promise.resolve({
              data: null,
              error: null,
              count: 1,
            }).then(resolve, reject);
          return builder;
        }

        throw new Error(`unexpected table ${table}`);
      };

      return {
        supabaseClient,
        user: { id: "u1" },
      };
    }),
  };
});

async function flushMicrotasks(iterations = 25) {
  for (let i = 0; i < iterations; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

describe("api.campaign-export CSV contract checks", () => {
  beforeEach(() => {
    uploads = [];
    requireWorkspaceAccess.mockClear();
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: any) => {
      if (typeof fn === "function") fn();
      return 0 as any;
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("produces BOM + CRLF CSV and neutralizes CSV injection", async () => {
    const mod = await import("../app/routing/api/api.campaign-export");
    const fd = new FormData();
    fd.set("campaignId", "123");
    fd.set("workspaceId", "w1");
    const req = new Request("http://localhost/api/campaign-export", {
      method: "POST",
      body: fd,
    });

    const res = await mod.action({ request: req } as any);
    expect(res.status).toBe(200);
    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);

    // export runs asynchronously; flush microtasks until the CSV upload has happened
    await flushMicrotasks();

    const csvUpload = uploads.find((u) => u.path.endsWith(".csv"));
    expect(csvUpload).toBeTruthy();
    const csvText = csvUpload!.text;

    expect(Array.from(csvUpload!.bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // BOM bytes
    expect(csvText).toContain("\r\n"); // CRLF

    // Contract: formula-like strings must be neutralized with a leading single quote.
    // Contact firstname is `=1+1` and should be emitted as `'=1+1`.
    expect(csvText).toContain(",'=1+1,");
  }, 30000);
});

