import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    parseRequestData: vi.fn(),
    updateContact: vi.fn(),
    bulkCreateContacts: vi.fn(),
    createContact: vi.fn(),
    handleError: vi.fn((_e: any, msg?: string) => new Response(msg ?? "err", { status: 500 })),
  };
});

vi.mock("../app/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  parseRequestData: (...args: any[]) => mocks.parseRequestData(...args),
  updateContact: (...args: any[]) => mocks.updateContact(...args),
  bulkCreateContacts: (...args: any[]) => mocks.bulkCreateContacts(...args),
  createContact: (...args: any[]) => mocks.createContact(...args),
  handleError: (...args: any[]) => mocks.handleError(...args),
}));

function makeContactQuery(result: { data: any[]; error: any }) {
  const b: any = {};
  b.select = () => b;
  b.textSearch = () => b;
  b.ilike = () => b;
  b.eq = () => b;
  b.limit = async () => result;
  return b;
}

describe("app/routes/api.contacts.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.parseRequestData.mockReset();
    mocks.updateContact.mockReset();
    mocks.bulkCreateContacts.mockReset();
    mocks.createContact.mockReset();
    mocks.handleError.mockClear();
  });

  test("action PATCH updates contact", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: {},
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.parseRequestData.mockResolvedValueOnce({ id: 1 });
    mocks.updateContact.mockResolvedValueOnce({ id: 1, ok: true });

    const mod = await import("../app/routing/api/api.contacts");
    const res = await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "PATCH" }),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { id: 1, ok: true } });
  });

  test("action POST bulk vs single", async () => {
    mocks.verifyAuth.mockResolvedValue({
      supabaseClient: {},
      headers: new Headers(),
      user: { id: "u1" },
    });
    const mod = await import("../app/routing/api/api.contacts");

    mocks.parseRequestData.mockResolvedValueOnce({
      contacts: [{ id: 1 }],
      workspace_id: "w1",
      audience_id: 2,
    });
    mocks.bulkCreateContacts.mockResolvedValueOnce({ created: 1 });
    let res = await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "POST" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ created: 1 });

    mocks.parseRequestData.mockResolvedValueOnce({ firstname: "a", audience_id: 2 });
    mocks.createContact.mockResolvedValueOnce({ id: 9 });
    res = await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "POST" }),
    } as any);
    await expect(res.json()).resolves.toEqual({ id: 9 });
  });

  test("action default unsupported method", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: {}, headers: new Headers(), user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({});
    const mod = await import("../app/routing/api/api.contacts");
    const res = await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "PUT" }),
    } as any);
    expect(res.status).toBe(400);
  });

  test("action returns 415 for unsupported content type error", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: {}, headers: new Headers(), user: { id: "u1" } });
    mocks.parseRequestData.mockRejectedValueOnce(new Error("Unsupported content type"));
    const mod = await import("../app/routing/api/api.contacts");
    const res = await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "POST" }),
    } as any);
    expect(res.status).toBe(415);
  });

  test("action other errors go through handleError (non-Error)", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: {}, headers: new Headers(), user: { id: "u1" } });
    mocks.parseRequestData.mockRejectedValueOnce("nope");
    const mod = await import("../app/routing/api/api.contacts");
    const res = await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "POST" }),
    } as any);
    expect(res.status).toBe(500);
    expect(mocks.handleError).toHaveBeenCalled();
  });

  test("action errors go through handleError (Error instance)", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: {}, headers: new Headers(), user: { id: "u1" } });
    mocks.parseRequestData.mockRejectedValueOnce(new Error("boom"));
    const mod = await import("../app/routing/api/api.contacts");
    const res = await mod.action({
      request: new Request("http://localhost/api/contacts", { method: "POST" }),
    } as any);
    expect(res.status).toBe(500);
    expect(mocks.handleError).toHaveBeenCalledWith(expect.any(Error), "An unexpected error occurred");
  });

  test("loader returns [] when q missing", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: {}, user: { id: "u1" } });
    const mod = await import("../app/routing/api/api.contacts");
    const res = await mod.loader({
      request: new Request("http://localhost/api/contacts"),
    } as any);
    await expect(res.json()).resolves.toEqual({ data: [] });
  });

  test("loader aggregates results, marks queued, and handles errors", async () => {
    const contactA = { id: 1, firstname: "a" };
    const contactB = { id: 2, firstname: "b" };
    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "contact") {
          // called 3 times with different query methods, but we can return same builder shape
          return makeContactQuery({ data: [contactA], error: null });
        }
        if (table === "campaign_queue") {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: [{ contact_id: 2 }], error: null }),
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });

    // Override second/third Promise.all results by swapping from() behavior mid-call:
    const q1 = makeContactQuery({ data: [contactA], error: null });
    const q2 = makeContactQuery({ data: [contactB], error: null });
    const q3 = makeContactQuery({ data: [], error: null });
    let n = 0;
    supabaseClient.from = (table: string) => {
      if (table === "contact") {
        n += 1;
        return n === 1 ? q1 : n === 2 ? q2 : q3;
      }
      if (table === "campaign_queue") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [{ contact_id: 2 }], error: null }),
            }),
          }),
        };
      }
      throw new Error("unexpected");
    };

    const mod = await import("../app/routing/api/api.contacts");
    const res = await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any);
    const body = await res.json();
    expect(body.contacts).toHaveLength(2);
    expect(body.contacts.find((c: any) => c.id === 2).queued).toBe(true);

    // allContacts empty => returns contacts:[]
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: {
        from: (table: string) => {
          if (table === "contact") return makeContactQuery({ data: [], error: null });
          throw new Error("unexpected");
        },
      },
      user: { id: "u1" },
    });
    const rEmpty = await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any);
    await expect(rEmpty.json()).resolves.toEqual({ contacts: [] });

    // queuedError => handleError
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: {
        from: (table: string) => {
          if (table === "contact") return makeContactQuery({ data: [contactA], error: null });
          if (table === "campaign_queue") {
            return {
              select: () => ({
                eq: () => ({
                  in: async () => ({ data: null, error: new Error("queued") }),
                }),
              }),
            };
          }
          throw new Error("unexpected");
        },
      },
      user: { id: "u1" },
    });
    const rQueuedErr = await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any);
    expect(rQueuedErr.status).toBe(500);
    expect(mocks.handleError).toHaveBeenCalled();

    // Error path: one of the contact queries errors -> handleError
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: {
        from: (table: string) => {
          if (table === "contact") return makeContactQuery({ data: [], error: new Error("q") });
          throw new Error("unexpected");
        },
      },
      user: { id: "u1" },
    });
    const resErr = await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any);
    expect(resErr.status).toBe(500);
    expect(mocks.handleError).toHaveBeenCalled();

    // phoneError/emailError branches + non-Error throw wrapping
    const qOk = makeContactQuery({ data: [contactA], error: null });
    const qPhoneErr = makeContactQuery({ data: [], error: new Error("phone") });
    const qEmailErr = makeContactQuery({ data: [], error: new Error("email") });
    let i = 0;
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: {
        from: (table: string) => {
          if (table !== "contact") throw "nope";
          i += 1;
          return i === 1 ? qOk : i === 2 ? qPhoneErr : qEmailErr;
        },
      },
      user: { id: "u1" },
    });
    const rPhone = await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any);
    expect(rPhone.status).toBe(500);
    expect(mocks.handleError).toHaveBeenCalledWith(expect.any(Error), "Error searching contacts");

    // emailError branch (3rd query error)
    const qOk2 = makeContactQuery({ data: [contactA], error: null });
    const qOk3 = makeContactQuery({ data: [contactB], error: null });
    const qEmailOnlyErr = makeContactQuery({ data: [], error: new Error("email") });
    let j = 0;
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: {
        from: (table: string) => {
          if (table !== "contact") throw new Error("unexpected");
          j += 1;
          return j === 1 ? qOk2 : j === 2 ? qOk3 : qEmailOnlyErr;
        },
      },
      user: { id: "u1" },
    });
    const rEmail = await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any);
    expect(rEmail.status).toBe(500);

    // non-Error throw inside try -> catch wraps into Error(String(err))
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: {
        from: (table: string) => {
          if (table === "contact") return makeContactQuery({ data: [contactA], error: null });
          if (table === "campaign_queue") throw "nope";
          throw new Error("unexpected");
        },
      },
      user: { id: "u1" },
    });
    const rNonErr = await mod.loader({
      request: new Request("http://localhost/api/contacts?q=A&workspace_id=w1&campaign_id=9"),
    } as any);
    expect(rNonErr.status).toBe(500);
  });
});

