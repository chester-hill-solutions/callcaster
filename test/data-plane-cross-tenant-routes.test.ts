import { beforeEach, describe, expect, test, vi } from "vitest";

import { loader as campaignsLoader } from "../app/routes/api+/workspaces+/$workspaceId/campaigns.loader.server";
import { loader as contactsLoader } from "../app/routes/api+/workspaces+/$workspaceId/contacts.loader.server";
import { loader as billingSessionLoader } from "../app/routes/api+/workspaces+/$workspaceId/billing/sessions/$sessionId.loader.server";
import { loader as eventsLoader } from "../app/routes/api+/workspaces+/$workspaceId/events.loader.server";
import { action as numberAction } from "../app/routes/api+/workspaces+/$workspaceId/numbers/$numberId.action.server";
import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  listWorkspaceCampaignsApi: vi.fn(),
  listWorkspaceContactsApi: vi.fn(),
  findContactsByPhone: vi.fn(),
  pollBillingCheckoutSession: vi.fn(),
  patchWorkspaceNumber: vi.fn(),
  deleteWorkspaceNumber: vi.fn(),
  fetchWorkspaceEventsAfter: vi.fn(),
  listen: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/platform-data.server", () => ({
  listWorkspaceCampaignsApi: (...args: unknown[]) =>
    mocks.listWorkspaceCampaignsApi(...args),
  listWorkspaceContactsApi: (...args: unknown[]) =>
    mocks.listWorkspaceContactsApi(...args),
}));

vi.mock("@/lib/database/contact.server", () => ({
  findContactsByPhone: (...args: unknown[]) => mocks.findContactsByPhone(...args),
}));

vi.mock("@/lib/platform-billing.server", () => ({
  pollBillingCheckoutSession: (...args: unknown[]) =>
    mocks.pollBillingCheckoutSession(...args),
}));

vi.mock("@/lib/platform-workspace-numbers.server", () => ({
  patchWorkspaceNumber: (...args: unknown[]) =>
    mocks.patchWorkspaceNumber(...args),
  deleteWorkspaceNumber: (...args: unknown[]) =>
    mocks.deleteWorkspaceNumber(...args),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: vi.fn(async () => ({ role: "member" })),
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/workspace-events.server", () => ({
  WORKSPACE_EVENTS_NOTIFY_CHANNEL: "workspace_events",
  fetchWorkspaceEventsAfter: (...args: unknown[]) =>
    mocks.fetchWorkspaceEventsAfter(...args),
}));

vi.mock("@/server/db", () => ({
  db: {},
  directPool: {
    listen: (...args: unknown[]) => mocks.listen(...args),
  },
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: (...args: unknown[]) => mocks.getSession(...args),
}));

const WORKSPACE_A = "11111111-1111-1111-1111-111111111111";
const WORKSPACE_B = "22222222-2222-2222-2222-222222222222";

async function crossTenantArgs(
  path: string,
  init?: RequestInit,
  params: Record<string, string> = {},
) {
  return withDataPlaneRouteArgs(
    {
      request: new Request(`http://localhost/api/workspaces/${WORKSPACE_B}/${path}`, init),
      params: { workspaceId: WORKSPACE_B, ...params },
    },
    { workspaceId: WORKSPACE_A },
  );
}

describe("WS-H data-plane cross-tenant route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("workspace A cannot list workspace B campaigns", async () => {
    const response = await asRouteResponse(
      campaignsLoader(await crossTenantArgs("campaigns")),
    );

    expect(response.status).toBe(404);
    expect(mocks.listWorkspaceCampaignsApi).not.toHaveBeenCalled();
  });

  test("workspace A cannot list workspace B contacts", async () => {
    const response = await asRouteResponse(
      contactsLoader(await crossTenantArgs("contacts")),
    );

    expect(response.status).toBe(404);
    expect(mocks.listWorkspaceContactsApi).not.toHaveBeenCalled();
    expect(mocks.findContactsByPhone).not.toHaveBeenCalled();
  });

  test("workspace A cannot poll a workspace B billing session", async () => {
    const response = await asRouteResponse(
      billingSessionLoader(
        await crossTenantArgs("billing/sessions/cs_test_b", undefined, {
          sessionId: "cs_test_b",
        }),
      ),
    );

    expect(response.status).toBe(404);
    expect(mocks.pollBillingCheckoutSession).not.toHaveBeenCalled();
  });

  test("workspace A cannot open workspace B events stream", async () => {
    const response = await asRouteResponse(
      eventsLoader(await crossTenantArgs("events")),
    );

    expect(response.status).toBe(404);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.fetchWorkspaceEventsAfter).not.toHaveBeenCalled();
  });

  test("workspace A cannot mutate a workspace B number", async () => {
    const response = await asRouteResponse(
      numberAction(
        await crossTenantArgs(
          "numbers/number-b",
          {
            method: "DELETE",
          },
          { numberId: "number-b" },
        ),
      ),
    );

    expect(response.status).toBe(404);
    expect(mocks.deleteWorkspaceNumber).not.toHaveBeenCalled();
    expect(mocks.patchWorkspaceNumber).not.toHaveBeenCalled();
  });
});
