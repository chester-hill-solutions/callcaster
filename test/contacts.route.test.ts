import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession, setDualAuthSession } from "./helpers/route-auth-mock";
vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  parseRequestData: vi.fn(),
  updateContact: vi.fn(),
  bulkCreateContacts: vi.fn(),
  createContact: vi.fn(),
  handleError: vi.fn((_e: any, msg?: string) => new Response(msg ?? "err", { status: 500 })),
}));

vi.mock("../app/lib/adminDb.server", () => ({
  getSession: () => ({ headers: new Headers(),
  }),
}));
vi.mock("../app/lib/database.server", () => ({
  parseRequestData: (...args: any[]) => mocks.parseRequestData(...args),
  updateContact: (...args: any[]) => mocks.updateContact(...args),
  bulkCreateContacts: (...args: any[]) => mocks.bulkCreateContacts(...args),
  createContact: (...args: any[]) => mocks.createContact(...args),
  handleError: (...args: any[]) => mocks.handleError(...args),
}));

const contactSearchMocks = vi.hoisted(() => ({
  searchContactsForQueuePicker: vi.fn(async () => []),
  getQueuedContactIdsForCampaign: vi.fn(async () => []),
}));

vi.mock("@/lib/database/contact.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/contact.server")>();
  return {
    ...actual,
    searchContactsForQueuePicker: (...args: unknown[]) =>
      contactSearchMocks.searchContactsForQueuePicker(...args),
  };
});

vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-queue-db.server")>();
  return {
    ...actual,
    getQueuedContactIdsForCampaign: (...args: unknown[]) =>
      contactSearchMocks.getQueuedContactIdsForCampaign(...args),
  };
});

function makeContactQuery(result: { data: any[]; error: any }) {
  const b: any = {};
  b.select = () => b;
  b.textSearch = () => b;
  b.ilike = () => b;
  b.eq = () => b;
  b.limit = async () => result;
  return b;
}

describe("app/routes/api+/contacts/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.parseRequestData.mockReset();
    mocks.updateContact.mockReset();
    mocks.bulkCreateContacts.mockReset();
    mocks.createContact.mockReset();
    mocks.handleError.mockClear();
  });

  test("action PATCH updates contact", async () => {
    queueDualAuthSession({ headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.parseRequestData.mockResolvedValueOnce({ id: 1 });
    mocks.updateContact.mockResolvedValueOnce({ id: 1, ok: true });

    const mod = await import("../app/routes/api+/contacts");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "PATCH" }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { id: 1, ok: true } });
  });

  test("action POST bulk vs single", async () => {
    queueDualAuthSession({ headers: new Headers(),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api+/contacts");

    mocks.parseRequestData.mockResolvedValueOnce({
      contacts: [{ id: 1 }],
      workspace_id: "w1",
      audience_id: 2,
    });
    mocks.bulkCreateContacts.mockResolvedValueOnce({ created: 1 });
    let res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "POST" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ created: 1 });

    mocks.parseRequestData.mockResolvedValueOnce({ firstname: "a", audience_id: 2 });
    mocks.createContact.mockResolvedValueOnce({ id: 9 });
    queueDualAuthSession({ headers: new Headers(),
      user: { id: "u1" },
    });
    res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "POST" }),
    } as any));
    await expect(res.json()).resolves.toEqual({ id: 9 });
  });

  test("action default unsupported method", async () => {
    queueDualAuthSession({ headers: new Headers(), user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({});
    const mod = await import("../app/routes/api+/contacts");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "PUT" }),
    } as any));
    expect(res.status).toBe(400);
  });

  test("action returns 415 for unsupported content type error", async () => {
    queueDualAuthSession({ headers: new Headers(), user: { id: "u1" } });
    mocks.parseRequestData.mockRejectedValueOnce(new Error("Unsupported content type"));
    const mod = await import("../app/routes/api+/contacts");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "POST" }),
    } as any));
    expect(res.status).toBe(415);
  });

  test("action other errors go through handleError (non-Error)", async () => {
    queueDualAuthSession({ headers: new Headers(), user: { id: "u1" } });
    mocks.parseRequestData.mockRejectedValueOnce("nope");
    const mod = await import("../app/routes/api+/contacts");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "POST" }),
    } as any));
    expect(res.status).toBe(500);
    expect(mocks.handleError).toHaveBeenCalled();
  });

  test("action errors go through handleError (Error instance)", async () => {
    queueDualAuthSession({ headers: new Headers(), user: { id: "u1" } });
    mocks.parseRequestData.mockRejectedValueOnce(new Error("boom"));
    const mod = await import("../app/routes/api+/contacts");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "POST" }),
    } as any));
    expect(res.status).toBe(500);
    expect(mocks.handleError).toHaveBeenCalledWith(expect.any(Error), "An unexpected error occurred");
  });

  test("loader returns [] when q missing", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    const mod = await import("../app/routes/api+/contacts");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/contacts"),
    } as any));
    await expect(res.json()).resolves.toEqual({ data: [] });
  });

  test("loader aggregates results, marks queued, and handles errors", async () => {
    const contactA = { id: 1, firstname: "a" };
    const contactB = { id: 2, firstname: "b" };

    contactSearchMocks.searchContactsForQueuePicker.mockResolvedValueOnce([
      contactA,
      contactB,
    ] as any);
    contactSearchMocks.getQueuedContactIdsForCampaign.mockResolvedValueOnce([2]);
    setDualAuthSession({ user: { id: "u1" } });

    const mod = await import("../app/routes/api+/contacts");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any));
    const body = await res.json();
    expect(body.contacts).toHaveLength(2);
    expect(body.contacts.find((c: any) => c.id === 2).queued).toBe(true);

    contactSearchMocks.searchContactsForQueuePicker.mockResolvedValueOnce([]);
    const rEmpty = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any));
    await expect(rEmpty.json()).resolves.toEqual({ contacts: [] });

    contactSearchMocks.searchContactsForQueuePicker.mockResolvedValueOnce([contactA] as any);
    contactSearchMocks.getQueuedContactIdsForCampaign.mockRejectedValueOnce(new Error("queued"));
    const rQueuedErr = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any));
    expect(rQueuedErr.status).toBe(500);
    expect(mocks.handleError).toHaveBeenCalled();

    contactSearchMocks.searchContactsForQueuePicker.mockRejectedValueOnce(new Error("q"));
    const resErr = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any));
    expect(resErr.status).toBe(500);
    expect(mocks.handleError).toHaveBeenCalledWith(expect.any(Error), "Error searching contacts");
  });
});

