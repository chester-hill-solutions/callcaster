import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  findCampaignInWorkspace: vi.fn(),
  fetchQueueCounts: vi.fn(),
  getUserRole: vi.fn(),
}));

vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-ivr.server")>();
  return {
    ...actual,
    findCampaignInWorkspace: (...args: unknown[]) => mocks.findCampaignInWorkspace(...args),
  };
});
vi.mock("@/lib/database/campaign.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/campaign.server")>();
  return {
    ...actual,
    fetchQueueCounts: (...args: unknown[]) => mocks.fetchQueueCounts(...args),
  };
});
vi.mock("@/lib/database/workspace.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/workspace.server")>();
  return {
    ...actual,
    getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
  };
});

async function runLoader(selectedId: string) {
  const mod = await import("../app/routes/workspaces+/$id/campaigns/$selected_id.route");
  return mod.loader({
    request: new Request(`http://localhost/workspaces/ws-1/campaigns/${selectedId}`),
    params: { id: "ws-1", selected_id: selectedId },
    context: new Map(),
  } as never);
}

// #1682: "/campaigns/blah" reached the database with a non-integer id and
// surfaced as "Unexpected Server Error". A malformed id is a 404, thrown as
// a real Response so RouteErrorBoundary renders "Page not found".
describe("app/routes/workspaces+/$id/campaigns/$selected_id.route.tsx loader", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.findCampaignInWorkspace.mockReset();
    mocks.fetchQueueCounts.mockReset();
    mocks.getUserRole.mockReset();
  });

  test("throws a 404 Response for a non-numeric campaign id before querying", async () => {
    const thrown = await runLoader("blah").then(
      () => null,
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
    expect(mocks.findCampaignInWorkspace).not.toHaveBeenCalled();
    expect(mocks.fetchQueueCounts).not.toHaveBeenCalled();
  });
});
