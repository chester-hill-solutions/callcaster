import { expect, test, vi } from "vitest";
import { onboardingFixture } from "./fixtures/onboarding";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";
import { asRouteResponse } from "./helpers/route-result";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";

const mocks = vi.hoisted(() => ({ onboarding: vi.fn() }));
vi.mock("@/lib/messaging-onboarding/persistence.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messaging-onboarding/persistence.server")>()),
  getWorkspaceMessagingOnboardingState: mocks.onboarding,
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getWorkspacePhoneNumbers: async () => ({ data: [] }),
  getWorkspaceInfoWithDetails: async () => ({
    workspace: { id: workspaceId, name: "Workspace", credits: 100 },
    campaigns: [], audiences: [], phoneNumbers: [],
  }),
}));
vi.mock("@/lib/database/workspace-conversations.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace-conversations.server")>()),
  getWorkspaceUnreadConversationCount: async () => 0,
}));
vi.mock("@/lib/database/workspace-twilio-portal-snapshot.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace-twilio-portal-snapshot.server")>()),
  getWorkspaceRecentOutboundMessageCount: async () => 1,
}));
vi.mock("@/lib/campaign-queue-search.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-search.server")>()),
  fetchWorkspaceCampaignQueueProgressMap: async () => new Map(),
}));

vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: () => ({ audience: { count: async () => 0 }, script: { count: async () => 0 } }),
}));

import { loader } from "@/routes/workspaces+/$id.loader.server";
const workspaceId = "00000000-0000-4000-8000-000000000001";
const completeAddress = {
  street: "123 Main St", city: "Toronto", region: "ON", postalCode: "M5V 2T6", countryCode: "CA",
};

async function load(
  address: typeof completeAddress,
  emergencyVoice: Partial<WorkspaceMessagingOnboardingState["emergencyVoice"]> = {},
) {
  const onboarding = onboardingFixture();
  onboarding.emergencyVoice = { ...onboarding.emergencyVoice, ...emergencyVoice };
  onboarding.emergencyVoice.address = { ...onboarding.emergencyVoice.address, ...address };
  mocks.onboarding.mockResolvedValue(onboarding);
  const context = await withWorkspaceRouteArgs({
    request: new Request(`http://localhost/workspaces/${workspaceId}`),
    params: { id: workspaceId },
  }, { workspaceId, userRole: "owner" });
  const response = await asRouteResponse(loader(context));
  expect(response.status).toBe(200);
  return response.json();
}

test.each(["street", "city", "region", "postalCode", "countryCode"] as const)(
  "a missing %s offers the address remedy while intake is incomplete",
  async (field) => {
    const body = await load({ ...completeAddress, [field]: "  " });
    expect(body.serviceAddressRequired).toBe(true);
    expect(body.complianceOnboarding).toBeUndefined();
    expect(body.onboardingReadiness.warnings).toContain("Add the emergency service address before renting a voice number.");
  },
);

test("a complete draft address does not offer a missing-address remedy", async () => {
  const body = await load(completeAddress);
  expect(body.serviceAddressRequired).toBe(false);
  expect(body.complianceOnboarding).toBeUndefined();
  expect(body.onboardingReadiness.warnings).not.toContain("Add the emergency service address before renting a voice number.");
});

test.each(["not_started", "pending_validation", "invalid"] as const)(
  "a complete %s address still requires voice setup",
  async (status) => {
    const address = { ...onboardingFixture().emergencyVoice.address, ...completeAddress, status };
    const body = await load(completeAddress, {
      enabled: true, emergencyEligiblePhoneNumbers: ["+14165550123"], address,
    });
    expect(body.serviceAddressRequired).toBe(false);
    expect(body.onboardingReadiness.voiceReady).toBe(false);
    expect(body.onboardingReadiness.warnings).toContain("Emergency voice readiness is incomplete.");
  },
);

test("a validated address without an eligible number still requires voice setup", async () => {
  const body = await load(completeAddress, {
    enabled: true,
    address: { ...onboardingFixture().emergencyVoice.address, ...completeAddress, status: "validated" },
  });
  expect(body.serviceAddressRequired).toBe(false);
  expect(body.onboardingReadiness.voiceReady).toBe(false);
  expect(body.onboardingReadiness.warnings).toContain("Emergency voice readiness is incomplete.");
});

test("validated enabled voice with an eligible number clears the voice warning", async () => {
  const body = await load(completeAddress, {
    enabled: true, emergencyEligiblePhoneNumbers: ["+14165550123"],
    address: { ...onboardingFixture().emergencyVoice.address, ...completeAddress, status: "validated" },
  });
  expect(body.serviceAddressRequired).toBe(false);
  expect(body.onboardingReadiness.voiceReady).toBe(true);
  expect(body.onboardingReadiness.warnings).not.toContain("Emergency voice readiness is incomplete.");
});
