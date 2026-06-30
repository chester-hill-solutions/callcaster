import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { setDualAuthSession } from "./helpers/route-auth-mock";
import { logger } from "@/lib/logger.server";

const contactAudienceMocks = vi.hoisted(() => ({
  listAudienceContactsForExport: vi.fn(async () => []),
  listAudienceContactsJson: vi.fn(async () => []),
  findAudienceWorkspaceById: vi.fn(async () => "w1" as string | null),
  upsertAudienceById: vi.fn(async (id: number, values: Record<string, unknown>) => ({
    id,
    ...values,
  })),
  deleteAudienceById: vi.fn(async () => true),
}));

vi.mock("@/lib/database/contact-audience.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/contact-audience.server")>();
  return {
    ...actual,
    listAudienceContactsForExport: (...args: unknown[]) =>
      contactAudienceMocks.listAudienceContactsForExport(...args),
    listAudienceContactsJson: (...args: unknown[]) =>
      contactAudienceMocks.listAudienceContactsJson(...args),
  };
});

vi.mock("@/lib/audience-upload-db.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audience-upload-db.server")>();
  return {
    ...actual,
    findAudienceWorkspaceById: (...args: unknown[]) =>
      contactAudienceMocks.findAudienceWorkspaceById(...args),
    upsertAudienceById: (...args: unknown[]) =>
      contactAudienceMocks.upsertAudienceById(...args),
    deleteAudienceById: (...args: unknown[]) =>
      contactAudienceMocks.deleteAudienceById(...args),
  };
});

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
    contactAudienceMocks.upsertAudienceById.mockReset();
    contactAudienceMocks.upsertAudienceById.mockImplementation(async (id, values) => ({
      id,
      ...values,
    }));
    const parseActionRequest = vi.fn();
    const verifyAuth = vi.fn(async () => ({ headers: new Headers() }));
    const requireWorkspaceAccess = vi.fn(async () => undefined);

    parseActionRequest.mockResolvedValueOnce({ name: "x" });
    const mod = await import("../app/routes/api+/audiences");
    const resMissing = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "PATCH" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(resMissing.status).toBe(400);

    // Covers `value ?? ""` branch for null id
    parseActionRequest.mockResolvedValueOnce({ id: null, name: "x" });
    const resNullId = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "PATCH" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(resNullId.status).toBe(400);

    parseActionRequest.mockResolvedValueOnce({ id: "1", name: "New", extra: { skip: true } });
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "PATCH" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(await res.json()).toEqual([{ id: 1, name: "New" }]);
    expect(contactAudienceMocks.upsertAudienceById).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: "New" }),
    );

    // Covers null update branch
    contactAudienceMocks.upsertAudienceById.mockResolvedValueOnce(null);
    parseActionRequest.mockResolvedValueOnce({ id: "3", name: "Maybe" });
    const resNull = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "PATCH" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(resNull.status).toBe(404);
  }, 30000);

  test("action DELETE validates id and logs delete errors", async () => {
    contactAudienceMocks.deleteAudienceById.mockReset();
    const mod = await import("../app/routes/api+/audiences");
    const parseActionRequest = vi.fn();
    const verifyAuth = vi.fn(async () => ({ headers: new Headers() }));
    const requireWorkspaceAccess = vi.fn(async () => undefined);

    parseActionRequest.mockResolvedValueOnce({});
    const resMissing = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "DELETE" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(resMissing.status).toBe(400);

    parseActionRequest.mockResolvedValueOnce({ id: "nope" });
    const resInvalid = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "DELETE" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(resInvalid.status).toBe(400);

    contactAudienceMocks.deleteAudienceById.mockResolvedValueOnce(false);
    parseActionRequest.mockResolvedValueOnce({ id: "2" });
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "DELETE" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(res.status).toBe(404);

    contactAudienceMocks.deleteAudienceById.mockResolvedValueOnce(true);
    parseActionRequest.mockResolvedValueOnce({ id: "3" });
    const resOk = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "DELETE" }),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(await resOk.json()).toEqual({ success: true });
  }, 30000);

  test("loader CSV validates params and enforces workspace access", async () => {
    const mockClient: any = {};
    const mod = await import("../app/routes/api+/audiences");
    const verifyAuth = vi.fn(async () => ({ headers: new Headers(), user: { id: "u1" } }));
    const parseActionRequest = vi.fn(async () => ({}));
    const requireWorkspaceAccess = vi.fn(async () => undefined);

    contactAudienceMocks.findAudienceWorkspaceById.mockReset();
    contactAudienceMocks.listAudienceContactsForExport.mockReset();
    contactAudienceMocks.findAudienceWorkspaceById.mockResolvedValue("w1");
    contactAudienceMocks.listAudienceContactsForExport.mockResolvedValue([]);

    const resMissing = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/audiences?returnType=csv"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(resMissing.status).toBe(400);

    const resInvalid = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/audiences?returnType=csv&audienceId=nope"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(resInvalid.status).toBe(400);

    contactAudienceMocks.findAudienceWorkspaceById.mockResolvedValueOnce(null);
    const res404 = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/audiences?returnType=csv&audienceId=1"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(res404.status).toBe(404);

    contactAudienceMocks.findAudienceWorkspaceById.mockResolvedValueOnce("w1");
    contactAudienceMocks.listAudienceContactsForExport.mockResolvedValueOnce([]);
    const res = await asRouteResponse(await mod.loader({
      request: new Request(
        "http://localhost/api/audiences?returnType=csv&audienceId=1&q=joe&sortKey=firstname&sortDirection=desc",
      ),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(res.status).toBe(200);
    expect(requireWorkspaceAccess).toHaveBeenCalled();
    expect(contactAudienceMocks.listAudienceContactsForExport).toHaveBeenCalledWith(
      "w1",
      1,
      expect.objectContaining({
        q: "joe",
        sortKey: "firstname",
        sortDirection: "desc",
      }),
    );
  }, 30000);

  test("loader CSV flattens other_data and throws on query error", async () => {
    contactAudienceMocks.findAudienceWorkspaceById.mockResolvedValue("w1");
    contactAudienceMocks.listAudienceContactsForExport.mockResolvedValueOnce([
      {
        other_data: [{ key: "X", value: "1" }, "bad" as any, { key: "Y" } as any],
        contact: { firstname: "a" },
      },
      { other_data: [], contact: { firstname: "b" } },
    ]);

    const mockClient: any = {};
    const mod = await import("../app/routes/api+/audiences");
    const verifyAuth = vi.fn(async () => ({ headers: new Headers(), user: { id: "u1" } }));
    const parseActionRequest = vi.fn(async () => ({}));
    const requireWorkspaceAccess = vi.fn(async () => undefined);

    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/audiences?returnType=csv&audienceId=1"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    const text = await res.text();
    expect(text).toContain("X");

    contactAudienceMocks.listAudienceContactsForExport.mockResolvedValueOnce([]);
    const resEmpty = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/audiences?returnType=csv&audienceId=1&sortKey=__bad__"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(resEmpty.status).toBe(200);
    expect(await resEmpty.text()).toContain("\r\n");

    contactAudienceMocks.listAudienceContactsForExport.mockRejectedValueOnce(new Error("q"));
    await expect(
      mod.loader({
        request: new Request("http://localhost/api/audiences?returnType=csv&audienceId=1"),
        deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
      } as any),
    ).rejects.toBeTruthy();
  }, 30000);

  test("resolveDeps fallbacks are covered via module mocks", async () => {
    vi.resetModules();

    contactAudienceMocks.upsertAudienceById.mockResolvedValueOnce({ id: 1, name: "x" });

    const parseActionRequest = vi.fn(async () => ({ id: "1", name: "x" }));
    const requireWorkspaceAccess = vi.fn(async () => undefined);

    setDualAuthSession({ headers: new Headers(), user: { id: "u1" } });
    vi.doMock("@/lib/database.server", () => ({ parseActionRequest, requireWorkspaceAccess }));

    const mod = await import("../app/routes/api+/audiences");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiences", { method: "PATCH" }),
    } as any));
    expect(await res.json()).toEqual([{ id: 1, name: "x" }]);
  }, 30000);

  test("loader JSON returns data and handles optional audienceId filter", async () => {
    contactAudienceMocks.listAudienceContactsJson.mockReset();
    contactAudienceMocks.listAudienceContactsJson.mockResolvedValueOnce([{ id: 1 }]);
    const mockClient: any = {};
    const mod = await import("../app/routes/api+/audiences");
    const verifyAuth = vi.fn(async () => ({ headers: new Headers(), user: { id: "u1" } }));
    const parseActionRequest = vi.fn(async () => ({}));
    const requireWorkspaceAccess = vi.fn(async () => undefined);
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/audiences"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any));
    expect(await res.json()).toEqual({ data: [{ id: 1 }] });

    await mod.loader({
      request: new Request("http://localhost/api/audiences?audienceId=not-a-number"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(contactAudienceMocks.listAudienceContactsJson).toHaveBeenLastCalledWith(undefined);

    await mod.loader({
      request: new Request("http://localhost/api/audiences?audienceId=12"),
      deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
    } as any);
    expect(contactAudienceMocks.listAudienceContactsJson).toHaveBeenLastCalledWith(12);

    contactAudienceMocks.listAudienceContactsJson.mockRejectedValueOnce(new Error("q"));
    await expect(
      mod.loader({
        request: new Request("http://localhost/api/audiences"),
        deps: { verifyAuth, parseActionRequest, requireWorkspaceAccess },
      } as any),
    ).rejects.toBeTruthy();
  }, 30000);
});

