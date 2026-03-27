import { describe, expect, test, vi } from "vitest";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const requireWorkspaceAccess = vi.fn(async () => undefined);
const supabaseMockState = vi.hoisted(() => ({ lastSupabaseClient: null as any }));

vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database.server")>(
    "@/lib/database.server",
  );
  return { ...actual, requireWorkspaceAccess };
});

vi.mock("@/lib/supabase.server", () => {
  return {
    verifyAuth: vi.fn(async () => {
      const supabaseClient: any = {};
      const contactAudienceCalls: any[] = [];

      supabaseClient.from = (table: string) => {
        if (table === "audience") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { workspace: "w1" },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "contact_audience") {
          const builder: any = {};
          builder.select = () => builder;
          builder.eq = (col: string, val: any) => {
            contactAudienceCalls.push({ op: "eq", col, val });
            return builder;
          };
          builder.or = (q: string) => {
            contactAudienceCalls.push({ op: "or", q });
            return builder;
          };
          builder.order = (key: string, opts: any) => {
            contactAudienceCalls.push({ op: "order", key, opts });
            return builder;
          };
          builder.then = (resolve: any, reject: any) =>
            Promise.resolve({
              data: [
                {
                  id: 1,
                  firstname: "=1+1",
                  surname: 'Doe, "Jr"',
                  opt_out: false,
                  other_data: [{ key: "custom", value: "@SUM(1,1)" }],
                },
              ],
              error: null,
            }).then(resolve, reject);
          // expose calls to tests
          (supabaseClient as any).__contactAudienceCalls = contactAudienceCalls;
          return builder;
        }

        throw new Error(`unexpected table ${table}`);
      };

      supabaseMockState.lastSupabaseClient = supabaseClient;
      return {
        supabaseClient,
        headers: new Headers(),
        user: { id: "u1" },
      };
    }),
  };
});

describe("api.audiences CSV export contract", () => {
  test("returns BOM + CRLF CSV with no-store headers and enforces workspace access", async () => {
    requireWorkspaceAccess.mockClear();
    const mod = await import("../app/routing/api/api.audiences");
    const request = new Request(
      "http://localhost/api/audiences?returnType=csv&audienceId=123&q=doe&sortKey=firstname&sortDirection=desc",
    );
    const res = await mod.loader({ request } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toContain("attachment;");

    // Validate BOM at the byte level to avoid implementations that strip BOM during .text().
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder("utf-8").decode(bytes);
    expect(csv).toContain("\r\n");
    // CSV injection protection: string-like cells starting with '=' or '@' are prefixed with a single quote.
    expect(csv).toContain("'\u003d1+1"); // "'=1+1" but avoid test runner escaping weirdness
    expect(csv).toContain("'@SUM(1,1)");

    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1" }),
    );
  });

  test("applies search + contact-field sort and produces deterministic headers", async () => {
    const mod = await import("../app/routing/api/api.audiences");
    const request = new Request(
      "http://localhost/api/audiences?returnType=csv&audienceId=123&q=doe&sortKey=firstname&sortDirection=desc",
    );
    const res = await mod.loader({ request } as any);
    expect(res.status).toBe(200);

    // Deterministic headers: row keys sorted.
    const bytes = new Uint8Array(await res.arrayBuffer());
    const csv = new TextDecoder("utf-8").decode(bytes);
    const headerLine = csv.split("\r\n")[0].replace(/^\uFEFF/, "");
    expect(headerLine.split(",")).toEqual([
      "custom",
      "firstname",
      "id",
      "opt_out",
      "surname",
    ]);

    // Query parity: ensure q is applied via OR over contact fields and sort uses contact(field)
    const calls = supabaseMockState.lastSupabaseClient?.__contactAudienceCalls as
      | any[]
      | undefined;
    expect(Array.isArray(calls)).toBe(true);
    expect(calls.some((c) => c.op === "or" && String(c.q).includes("contact.firstname.ilike")))
      .toBe(true);
    expect(
      calls.some(
        (c) =>
          c.op === "order" &&
          c.key === "contact(firstname)" &&
          c.opts?.ascending === false,
      ),
    ).toBe(true);
  });
});

