import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    getUserRole: vi.fn(),
    logger: {
      error: vi.fn(),
    },
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: unknown[]) => mocks.verifyAuth(...args),
}));

vi.mock("@/lib/database.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: mocks.logger,
}));

class ContactQueryBuilder {
  constructor(private readonly result: unknown) {}

  select = vi.fn(() => this);
  eq = vi.fn(() => this);
  range = vi.fn(() => this);
  order = vi.fn(() => this);
  or = vi.fn(() => this);

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function buildWorkspaceQuery(result: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => result),
      })),
    })),
  };
}

describe("app/routes/workspaces_.$id_.contacts.tsx", () => {
  const workspaceId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.getUserRole.mockReset();
    mocks.logger.error.mockReset();
  });

  test("uses prefix search for short query guardrails", async () => {
    const countQuery = new ContactQueryBuilder({ count: 0, error: null });
    const contactsQuery = new ContactQueryBuilder({ data: [], error: null });
    let contactQueryCount = 0;

    const supabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "contact") {
          contactQueryCount += 1;
          return contactQueryCount === 1 ? countQuery : contactsQuery;
        }

        if (table === "workspace") {
          return buildWorkspaceQuery({
            data: {
              id: workspaceId,
              name: "Workspace",
              credits: 1,
              feature_flags: {},
            },
            error: null,
          });
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });

    const mod = await import("../app/routes/workspaces_.$id_.contacts");
    const res = await mod.loader({
      request: new Request(
        `http://localhost/workspaces/${workspaceId}/contacts?q=jo`,
      ),
      params: { id: workspaceId },
    } as any);

    expect(res.status).toBe(200);

    const countFilter = String(countQuery.or.mock.calls[0]?.[0]);
    expect(countFilter).toContain("surname.ilike.jo%");
    expect(countFilter).not.toContain("surname.ilike.%jo%");
    expect(countFilter).toContain("phone.ilike.jo%");
  });

  test("uses contains search for longer text queries", async () => {
    const countQuery = new ContactQueryBuilder({ count: 0, error: null });
    const contactsQuery = new ContactQueryBuilder({ data: [], error: null });
    let contactQueryCount = 0;

    const supabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "contact") {
          contactQueryCount += 1;
          return contactQueryCount === 1 ? countQuery : contactsQuery;
        }

        if (table === "workspace") {
          return buildWorkspaceQuery({
            data: {
              id: workspaceId,
              name: "Workspace",
              credits: 1,
              feature_flags: {},
            },
            error: null,
          });
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });

    const mod = await import("../app/routes/workspaces_.$id_.contacts");
    await mod.loader({
      request: new Request(
        `http://localhost/workspaces/${workspaceId}/contacts?q=example.com`,
      ),
      params: { id: workspaceId },
    } as any);

    const countFilter = String(countQuery.or.mock.calls[0]?.[0]);
    expect(countFilter).toContain("surname.ilike.%example.com%");
    expect(countFilter).toContain("email.ilike.%example.com%");
  });

  test("supports phone substring and last4 search for longer numeric queries", async () => {
    const countQuery = new ContactQueryBuilder({ count: 0, error: null });
    const contactsQuery = new ContactQueryBuilder({ data: [], error: null });
    let contactQueryCount = 0;

    const supabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "contact") {
          contactQueryCount += 1;
          return contactQueryCount === 1 ? countQuery : contactsQuery;
        }

        if (table === "workspace") {
          return buildWorkspaceQuery({
            data: {
              id: workspaceId,
              name: "Workspace",
              credits: 1,
              feature_flags: {},
            },
            error: null,
          });
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });

    const mod = await import("../app/routes/workspaces_.$id_.contacts");
    await mod.loader({
      request: new Request(
        `http://localhost/workspaces/${workspaceId}/contacts?q=1234`,
      ),
      params: { id: workspaceId },
    } as any);

    const countFilter = String(countQuery.or.mock.calls[0]?.[0]);
    expect(countFilter).toContain("phone.eq.1234");
    expect(countFilter).toContain("phone.ilike.1234%");
    expect(countFilter).toContain("phone.ilike.%1234%");
  });
});
