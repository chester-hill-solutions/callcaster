import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  getUserRole: vi.fn(),
  getWorkspaceForClient: vi.fn(),
  listWorkspaceContactsApi: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers() }),
  verifyAuth: (...args: unknown[]) => mocks.verifyAuth(...args),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
}));

vi.mock("@/lib/workspace-client-projection.server", () => ({
  getWorkspaceForClient: (...args: unknown[]) => mocks.getWorkspaceForClient(...args),
}));

vi.mock("@/lib/platform-data.server", () => ({
  listWorkspaceContactsApi: (...args: unknown[]) =>
    mocks.listWorkspaceContactsApi(...args),
}));

const tdbMocks = vi.hoisted(() => ({
  campaign: {
    findMany: vi.fn(async () => []),
  },
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tdbMocks),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: mocks.logger,
}));

const workspaceId = "11111111-1111-1111-1111-111111111111";

function makeWorkspace() {
  return {
    id: workspaceId,
    name: "Workspace",
    credits: 1,
    feature_flags: {},
  };
}

function makeContactsResult(searchParams: URLSearchParams) {
  return {
    ok: true as const,
    contacts: [],
    pagination: { page: 1, page_size: 20, total_count: 0, total_pages: 0 },
    search_query: searchParams.get("q") || null,
  };
}

describe("app/routes/workspaces++_.$id_.contacts.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.getUserRole.mockReset();
    mocks.getWorkspaceForClient.mockReset();
    mocks.listWorkspaceContactsApi.mockReset();
    mocks.logger.error.mockReset();
  });

  test("uses prefix search for short query guardrails", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });
    mocks.getWorkspaceForClient.mockResolvedValueOnce(makeWorkspace());
    mocks.listWorkspaceContactsApi.mockResolvedValueOnce(makeContactsResult(new URLSearchParams("q=jo")));

    const mod = await import("../app/routes/workspaces+/$id/contacts.route");
    const res = await asRouteResponse(mod.loader(await withWorkspaceRouteArgs({
      request: new Request(
        `http://localhost/workspaces/${workspaceId}/contacts?q=jo`,
      ),
      params: { id: workspaceId },
    })));

    expect(res.status).toBe(200);
    const [, searchParams] = mocks.listWorkspaceContactsApi.mock.calls[0];
    expect(searchParams.get("q")).toBe("jo");
  });

  test("uses contains search for longer text queries", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });
    mocks.getWorkspaceForClient.mockResolvedValueOnce(makeWorkspace());
    mocks.listWorkspaceContactsApi.mockResolvedValueOnce(makeContactsResult(new URLSearchParams("q=example.com")));

    const mod = await import("../app/routes/workspaces+/$id/contacts.route");
    const res = await asRouteResponse(mod.loader(await withWorkspaceRouteArgs({
      request: new Request(
        `http://localhost/workspaces/${workspaceId}/contacts?q=example.com`,
      ),
      params: { id: workspaceId },
    })));

    expect(res.status).toBe(200);
    const [, searchParams] = mocks.listWorkspaceContactsApi.mock.calls[0];
    expect(searchParams.get("q")).toBe("example.com");
  });

  test("supports phone substring and last4 search for longer numeric queries", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });
    mocks.getWorkspaceForClient.mockResolvedValueOnce(makeWorkspace());
    mocks.listWorkspaceContactsApi.mockResolvedValueOnce(makeContactsResult(new URLSearchParams("q=1234")));

    const mod = await import("../app/routes/workspaces+/$id/contacts.route");
    const res = await asRouteResponse(mod.loader(await withWorkspaceRouteArgs({
      request: new Request(
        `http://localhost/workspaces/${workspaceId}/contacts?q=1234`,
      ),
      params: { id: workspaceId },
    })));

    expect(res.status).toBe(200);
    const [, searchParams] = mocks.listWorkspaceContactsApi.mock.calls[0];
    expect(searchParams.get("q")).toBe("1234");
  });
});
