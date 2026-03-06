import { beforeEach, describe, expect, test, vi } from "vitest";
import { logger } from "@/lib/logger.server";

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@/lib/logger.server", () => ({ logger: loggerMock }));

function makeQuery(result: any) {
  const q: any = {
    or: vi.fn(() => q),
    order: vi.fn(() => q),
    eq: vi.fn(() => q),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

describe("api.audiences route", () => {
  beforeEach(() => {
    (logger.error as any).mockClear?.();
  });

  test("action PATCH upserts and validates id", async () => {
    const upsert = vi.fn();
    const select = vi.fn();
    const supabaseClient: any = {
      from: () => ({
        upsert: (...args: any[]) => {
          upsert(...args);
          return { eq: () => ({ select }) };
        },
      }),
    };
    const parseActionRequest = vi.fn();
    const verifyAuth = vi.fn(async () => ({ supabaseClient, headers: new Headers() }));
    const requireWorkspaceAccess = vi.fn(async () => undefined);

    parseActionRequest.mockResolvedValueOnce({ name: "x" });
    const mod = await import("../app/routes/api.audiences");
    const resMissing = await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "PATCH" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(resMissing.status).toBe(400);

    // Covers `value ?? ""` branch for null id
    parseActionRequest.mockResolvedValueOnce({ id: null, name: "x" });
    const resNullId = await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "PATCH" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(resNullId.status).toBe(400);

    parseActionRequest.mockResolvedValueOnce({ id: "1", name: "New", extra: { skip: true } });
    select.mockResolvedValueOnce({ data: [{ id: 1, name: "New" }], error: null });
    const res = await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "PATCH" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(await res.json()).toEqual([{ id: 1, name: "New" }]);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: "New" }));

    // Covers `update || null` branch
    parseActionRequest.mockResolvedValueOnce({ id: "3", name: "Maybe" });
    select.mockResolvedValueOnce({ data: null, error: null });
    const resNull = await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "PATCH" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(await resNull.json()).toBeNull();
  }, 30000);

  test("action DELETE validates id and logs delete errors", async () => {
    const del = vi.fn();
    let deleteError: any = new Error("x");
    const supabaseClient: any = {
      from: () => ({
        delete: () => ({ eq: async (...args: any[]) => (del(...args), { error: deleteError }) }),
      }),
    };
    const mod = await import("../app/routes/api.audiences");
    const parseActionRequest = vi.fn();
    const verifyAuth = vi.fn(async () => ({ supabaseClient, headers: new Headers() }));
    const requireWorkspaceAccess = vi.fn(async () => undefined);

    parseActionRequest.mockResolvedValueOnce({});
    const resMissing = await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "DELETE" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(resMissing.status).toBe(400);

    parseActionRequest.mockResolvedValueOnce({ id: "nope" });
    const resInvalid = await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "DELETE" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(resInvalid.status).toBe(400);

    parseActionRequest.mockResolvedValueOnce({ id: "2" });
    const res = await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "DELETE" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(await res.json()).toEqual({ success: true });
    expect(logger.error).toHaveBeenCalled();

    // Covers non-error delete path
    const before = (logger.error as any).mock.calls.length;
    deleteError = null;
    parseActionRequest.mockResolvedValueOnce({ id: "3" });
    const resOk = await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "DELETE" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(await resOk.json()).toEqual({ success: true });
    expect((logger.error as any).mock.calls.length).toBe(before);
  }, 30000);

  test("loader CSV validates params and enforces workspace access", async () => {
    const audienceSingle = vi.fn();
    const contactAudienceQuery = makeQuery({ data: [], error: null });

    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "audience") {
          return { select: () => ({ eq: () => ({ single: audienceSingle }) }) };
        }
        if (table === "contact_audience") {
          return { select: () => ({ eq: () => contactAudienceQuery }) };
        }
        throw new Error("unexpected");
      },
    };
    const mod = await import("../app/routes/api.audiences");
    const verifyAuth = vi.fn(async () => ({ supabaseClient, headers: new Headers(), user: { id: "u1" } }));
    const parseActionRequest = vi.fn(async () => ({}));
    const requireWorkspaceAccess = vi.fn(async () => undefined);

    const resMissing = await mod.loader({
      request: new Request("http://localhost/api/audiences?returnType=csv"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(resMissing.status).toBe(400);

    const resInvalid = await mod.loader({
      request: new Request("http://localhost/api/audiences?returnType=csv&audienceId=nope"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(resInvalid.status).toBe(400);

    audienceSingle.mockResolvedValueOnce({ data: null, error: null });
    const res404 = await mod.loader({
      request: new Request("http://localhost/api/audiences?returnType=csv&audienceId=1"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(res404.status).toBe(404);

    audienceSingle.mockResolvedValueOnce({ data: { workspace: "w1" }, error: null });
    contactAudienceQuery.or.mockClear();
    contactAudienceQuery.order.mockClear();
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api/audiences?returnType=csv&audienceId=1&q=joe&sortKey=firstname&sortDirection=desc",
      ),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(res.status).toBe(200);
    expect(requireWorkspaceAccess).toHaveBeenCalled();
    expect(contactAudienceQuery.or).toHaveBeenCalled();
    expect(contactAudienceQuery.order).toHaveBeenCalled();
  }, 30000);

  test("loader CSV flattens other_data and throws on query error", async () => {
    const audienceSingle = vi.fn(async () => ({ data: { workspace: "w1" }, error: null }));
    const okQuery = makeQuery({
      data: [
        {
          other_data: [{ key: "X", value: "1" }, "bad" as any, { key: "Y" } as any],
          contact: { firstname: "a" },
        },
        { other_data: [], contact: { firstname: "b" } },
      ],
      error: null,
    });
    const badQuery = makeQuery({ data: null, error: new Error("q") });

    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "audience") return { select: () => ({ eq: () => ({ single: audienceSingle }) }) };
        if (table === "contact_audience") return { select: () => ({ eq: () => okQuery }) };
        throw new Error("unexpected");
      },
    };
    const mod = await import("../app/routes/api.audiences");
    const verifyAuth = vi.fn(async () => ({ supabaseClient, headers: new Headers(), user: { id: "u1" } }));
    const parseActionRequest = vi.fn(async () => ({}));
    const requireWorkspaceAccess = vi.fn(async () => undefined);

    const res = await mod.loader({
      request: new Request("http://localhost/api/audiences?returnType=csv&audienceId=1"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    const text = await res.text();
    expect(text).toContain("X");

    // Covers `processedData ?? []` branch (null data)
    const emptyQuery = makeQuery({ data: null, error: null });
    const supabaseClientEmpty: any = {
      from: (table: string) => {
        if (table === "audience") return { select: () => ({ eq: () => ({ single: audienceSingle }) }) };
        if (table === "contact_audience") return { select: () => ({ eq: () => emptyQuery }) };
        throw new Error("unexpected");
      },
    };
    const resEmpty = await mod.loader({
      request: new Request("http://localhost/api/audiences?returnType=csv&audienceId=1&sortKey=__bad__"),
      deps: {
        verifyAuth: vi.fn(async () => ({ supabaseClient: supabaseClientEmpty, headers: new Headers(), user: { id: "u1" } })),
        parseActionRequest,
        requireWorkspaceAccess,
      },
    } as any);
    expect(resEmpty.status).toBe(200);
    expect(emptyQuery.order).not.toHaveBeenCalled();
    expect(await resEmpty.text()).toContain("\r\n");

    const supabaseClient2: any = {
      from: (table: string) => {
        if (table === "audience") return { select: () => ({ eq: () => ({ single: audienceSingle }) }) };
        if (table === "contact_audience") return { select: () => ({ eq: () => badQuery }) };
        throw new Error("unexpected");
      },
    };
    await expect(
      mod.loader({
        request: new Request("http://localhost/api/audiences?returnType=csv&audienceId=1"),
        deps: {
          verifyAuth: vi.fn(async () => ({ supabaseClient: supabaseClient2, headers: new Headers(), user: { id: "u1" } })),
          parseActionRequest,
          requireWorkspaceAccess,
        },
      } as any),
    ).rejects.toBeTruthy();
  }, 30000);

  test("resolveDeps fallbacks are covered via module mocks", async () => {
    vi.resetModules();

    const select = vi.fn(async () => ({ data: [{ id: 1 }], error: null }));
    const supabaseClient: any = {
      from: () => ({
        upsert: () => ({ eq: () => ({ select }) }),
      }),
    };

    const verifyAuth = vi.fn(async () => ({ supabaseClient, headers: new Headers() }));
    const parseActionRequest = vi.fn(async () => ({ id: "1", name: "x" }));
    const requireWorkspaceAccess = vi.fn(async () => undefined);

    vi.doMock("@/lib/supabase.server", () => ({ verifyAuth }));
    vi.doMock("@/lib/database.server", () => ({ parseActionRequest, requireWorkspaceAccess }));

    const mod = await import("../app/routes/api.audiences");
    const res = await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "PATCH" }),
    } as any);
    expect(await res.json()).toEqual([{ id: 1 }]);
  }, 30000);

  test("loader JSON returns data and handles optional audienceId filter", async () => {
    const query = makeQuery({ data: [{ id: 1 }], error: null });
    const supabaseClient: any = { from: () => ({ select: () => query }) };
    const mod = await import("../app/routes/api.audiences");
    const verifyAuth = vi.fn(async () => ({ supabaseClient, headers: new Headers(), user: { id: "u1" } }));
    const parseActionRequest = vi.fn(async () => ({}));
    const requireWorkspaceAccess = vi.fn(async () => undefined);
    const res = await mod.loader({
      request: new Request("http://localhost/api/audiences"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(await res.json()).toEqual({ data: [{ id: 1 }] });

    await mod.loader({
      request: new Request("http://localhost/api/audiences?audienceId=not-a-number"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(query.eq).not.toHaveBeenCalledWith("audience_id", expect.anything());

    await mod.loader({
      request: new Request("http://localhost/api/audiences?audienceId=12"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(query.eq).toHaveBeenCalledWith("audience_id", 12);

    const bad = makeQuery({ data: null, error: new Error("q") });
    const supabaseBad: any = { from: () => ({ select: () => bad }) };
    await expect(
      mod.loader({
        request: new Request("http://localhost/api/audiences"),
        deps: {
          verifyAuth: vi.fn(async () => ({ supabaseClient: supabaseBad, headers: new Headers(), user: { id: "u1" } })),
          parseActionRequest,
          requireWorkspaceAccess,
        },
      } as any),
    ).rejects.toBeTruthy();
  }, 30000);
});

