import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import Workspace from "@/routes/workspaces+/$id";
import { ServiceAddressGate } from "@/components/phone-numbers/ServiceAddressGate";
import { onboardingFixture } from "../fixtures/onboarding";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";

vi.mock("@/routes/workspaces+/$id.loader.server", () => ({ loader: vi.fn() }));
vi.mock("@/routes/workspaces+/$id.middleware.server", () => ({ middleware: [] }));
vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: () => undefined,
}));
vi.mock("@/components/workspace/WorkspaceNav", () => ({ default: () => null }));

const warning = "Add the emergency service address before renting a voice number. Emergency voice readiness is incomplete.";
const workspaceId = "00000000-0000-4000-8000-000000000001";
const path = `/workspaces/${workspaceId}`;

function renderWorkspace({
  role = "owner", showWarning = true, addressComplete = false,
  showCompliance = true, voiceReady = false, addressStatus = "validated",
}: {
  role?: string;
  showWarning?: boolean;
  addressComplete?: boolean;
  showCompliance?: boolean;
  voiceReady?: boolean;
  addressStatus?: WorkspaceMessagingOnboardingState["emergencyVoice"]["address"]["status"];
} = {}) {
  const onboarding = onboardingFixture();
  if (addressComplete) {
    onboarding.emergencyVoice.address = {
      ...onboarding.emergencyVoice.address,
      street: "123 Main St", city: "Toronto", region: "ON",
      postalCode: "M5V 2T6", countryCode: "CA", status: addressStatus,
    };
  }
  const router = createMemoryRouter([
    {
      path,
      loader: () => ({
        userRole: role,
        workspaceData: {
          workspace: { id: workspaceId, name: "Workspace", credits: 100 },
          audiences: [], campaigns: [], phoneNumbers: [],
        },
        onboardingReadiness: {
          shouldShowOnboardingBanner: showWarning,
          voiceReady,
          warnings: [addressComplete
            ? voiceReady
              ? "Messaging Service has not been provisioned yet."
              : "Emergency voice readiness is incomplete."
            : warning],
        },
        serviceAddressRequired: !addressComplete,
        ...(showCompliance ? { complianceOnboarding: onboarding } : {}),
        campaignQueueProgress: {},
      }),
      Component: Workspace,
    },
    {
      path: `${path}/phone-numbers`,
      Component: () => <ServiceAddressGate workspaceId={workspaceId} onboarding={onboarding} />,
    },
  ], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("workspace service-address remedy", () => {
  test.each(["owner", "admin"])("%s can go directly from the warning to the existing address form", async (role) => {
    const router = renderWorkspace({ role });
    const action = await screen.findByRole("link", { name: "Continue workspace setup: add service address" });
    expect(action).toHaveAttribute("href", `${path}/phone-numbers#service-address`);
    expect(screen.getByText(warning)).toBeVisible();
    fireEvent.click(action);
    expect(await screen.findByLabelText(/Street address/)).toBeEnabled();
    expect(router.state.location.hash).toBe("#service-address");
    expect(screen.getByTestId("service-address-gate")).toHaveAttribute("id", "service-address");
    expect(screen.getByRole("button", { name: "Save address" })).toBeEnabled();
  });

  test("keeps the remedy available before the compliance panel is shown", async () => {
    renderWorkspace({ showCompliance: false });
    expect(await screen.findByRole("link", { name: "Continue workspace setup: add service address" })).toBeVisible();
  });

  test.each(["member", "caller", ""])("%s has the warning but no address-edit remedy", async (role) => {
    renderWorkspace({ role });
    expect(await screen.findByText(warning)).toBeVisible();
    expect(screen.queryByRole("link", { name: /Continue workspace setup: add service address/ })).toBeNull();
  });

  test("does not add an address remedy when the warning is absent", async () => {
    renderWorkspace({ showWarning: false });
    await screen.findByRole("main");
    expect(screen.queryByText(warning)).toBeNull();
    expect(screen.queryByRole("link", { name: /Continue workspace setup: add service address/ })).toBeNull();
  });

  test("does not direct another setup warning to an already validated address", async () => {
    renderWorkspace({ addressComplete: true, voiceReady: true });
    expect(await screen.findByText("Continue workspace setup")).toBeVisible();
    expect(screen.getByText("Messaging Service has not been provisioned yet.")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Continue workspace setup: add service address/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Continue workspace setup: review voice setup/ })).toBeNull();
  });

  test.each(["owner", "admin"])("%s can review a complete pending-validation address from the notice", async (role) => {
    const router = renderWorkspace({ role, addressComplete: true, addressStatus: "pending_validation" });
    const action = await screen.findByRole("link", { name: "Continue workspace setup: review voice setup" });
    expect(action).toHaveAttribute("href", `${path}/phone-numbers#service-address`);
    fireEvent.click(action);
    expect(await screen.findByText("pending validation")).toBeVisible();
    expect(screen.getByRole("button", { name: "Validate address" })).toBeEnabled();
    expect(router.state.location.hash).toBe("#service-address");
  });

  test.each(["not_started", "invalid", "validated"] as const)("a complete %s address keeps the review action until voice is ready", async (addressStatus) => {
    renderWorkspace({ addressComplete: true, addressStatus });
    expect(await screen.findByRole("link", { name: "Continue workspace setup: review voice setup" })).toHaveAttribute("href", `${path}/phone-numbers#service-address`);
  });

  test.each(["member", "caller", ""])("%s does not get the owner/admin pending-validation remedy", async (role) => {
    renderWorkspace({ role, addressComplete: true, addressStatus: "pending_validation" });
    expect(await screen.findByText("Continue workspace setup")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Continue workspace setup:/ })).toBeNull();
  });
});
