import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { createRouteContextProvider, mockWorkspaceContext } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  findCampaignInWorkspace: vi.fn(),
  fetchQueueCounts: vi.fn(),
  fetchCampaignDetails: vi.fn(),
  fetchBasicResults: vi.fn(),
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
    fetchCampaignDetails: mocks.fetchCampaignDetails,
    fetchBasicResults: mocks.fetchBasicResults,
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
  const request = new Request(`http://localhost/workspaces/ws-1/campaigns/${selectedId}`);
  const context = await createRouteContextProvider({ workspace: mockWorkspaceContext() });
  return mod.loader({ request, url: new URL(request.url), params: { id: "ws-1", selected_id: selectedId }, context });
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


describe("results loader campaign expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-10-03T12:00:00Z");
    mocks.fetchQueueCounts.mockResolvedValue({ fullCount: 3, queuedCount: 3 });
    mocks.fetchCampaignDetails.mockResolvedValue({ script_id: 7 });
    mocks.fetchBasicResults.mockResolvedValue([]);
    mocks.getUserRole.mockResolvedValue({ role: "owner" });
  });
  afterEach(() => vi.useRealTimers());
  test.each([{ end: "2026-10-03T11:59:59.999Z", expired: true }, { end: "2026-10-03T12:00:00Z", expired: false }])("end $end controls joining a running campaign", async ({ end, expired }) => {
    mocks.findCampaignInWorkspace.mockResolvedValue({
      id: 42, type: "live_call", status: "running", caller_id: "+15555550100",
      start_date: "2026-10-01T00:00:00Z", end_date: end,
      schedule: { monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] } },
    });
    const response = await asRouteResponse(runLoader("42"));
    if (expired) expect(await response.json()).toMatchObject({
      joinDisabled: expect.stringContaining("end date has passed"),
      readiness: { issues: [{ code: "campaign_ended", message: expect.any(String) }] },
    });
    else expect(await response.json()).toMatchObject({ joinDisabled: null });
  });
});
