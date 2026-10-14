import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, type ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AudienceUploadMapStep } from "@/components/audience/AudienceUploadMapStep";
import { SplitCampaignPrompt } from "@/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign";
import { HealthPanel } from "@/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.HealthPanel";
import { onboardingFixture } from "../fixtures/onboarding";
import { makePortalConfig } from "../fixtures/workspace-twilio-portal-config";
import { OperationalGuidancePanel } from "@/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.OperationalGuidancePanel";
import { NumberRentalCreditsAlert } from "@/components/phone-numbers/NumberRentalCreditsAlert";
import Account from "@/routes/account";

vi.mock("@/routes/account.loader.server", () => ({ action: vi.fn(), loader: vi.fn() }));
const observeTone = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/alert", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/ui/alert")>();
  return {
    ...original,
    Alert: (props: ComponentProps<typeof original.Alert>) => {
      observeTone(props.variant);
      return createElement(original.Alert, props);
    },
  };
});

beforeEach(() => { observeTone.mockClear(); });

describe("Alert tone adoption (#2061)", () => {
  test.each([undefined, "default"] as const)("omitted and explicit neutral variants use the agreed card surface: %s", (variant) => {
    render(<Alert variant={variant}><AlertTitle>Workspace summary</AlertTitle><AlertDescription>Current settings.</AlertDescription></Alert>);
    const notice = screen.getByRole("alert");
    expect(notice).toHaveClass("bg-card", "text-card-foreground", "border-border");
    expect(notice).not.toHaveClass("bg-brand-wash", "border-brand-tertiary");
    expect(within(notice).getByText("Current settings.")).toBeInTheDocument();
  });

  test("retains caller-owned announcement roles and neutral styling on an update", () => {
    const { rerender } = render(<Alert role="status">Preparing messaging.</Alert>);
    expect(screen.getByRole("status")).toHaveClass("bg-card");
    rerender(<Alert role={undefined}>Messaging is ready.</Alert>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Messaging is ready.")).toHaveClass("bg-card");
  });

  test("insufficient rental credits retain the existing error surface and billing remedy", () => {
    const router = createMemoryRouter([{
      path: "/numbers", Component: () => <NumberRentalCreditsAlert creditsBalance={0} billingLink="/credits" />,
    }], { initialEntries: ["/numbers"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("alert").className).toMatch(/\bbg-destructive\//);
    expect(screen.getByRole("link", { name: "Buy credits" })).toHaveAttribute("href", "/credits");
  });

  test("mapping help is neutral while a missing phone mapping retains its error and continue gate", () => {
    const onContinue = vi.fn();
    render(<AudienceUploadMapStep
      fileName="contacts.csv" rowCount={1} headers={["phone", "name"]}
      headerMapping={{ phone: "other_data", name: "name" }} previewRows={[{ phone: "+15555550100", name: "Test User" }]}
      mappingIssues={[{ code: "missing-phone", headers: [], message: "Choose the column that contains phone numbers.", blocking: true }]}
      hasBlockingMappingIssue hasOptOutMapped={false}
      onHeaderMappingChange={vi.fn()} onContinue={onContinue} onChooseAnotherFile={vi.fn()}
    />);
    const notice = screen.getByText("Mapping needs attention").closest('[data-slot="alert"]');
    expect(notice?.className).toMatch(/\bbg-destructive\//);
    const hint = screen.getByText("Contacts need a valid phone number to dial or message. Rows without one are left out of the import.");
    expect(hint.closest('[data-slot="alert"]')).toHaveClass("bg-card");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).not.toHaveBeenCalled();
  });

  test.each([false, true])("bulk-send safeguards use the warning surface with overrideActive=%s", (overrideActive) => {
    const router = createMemoryRouter([{
      path: "/workspaces/w1/campaigns/9/settings",
      Component: () => <SplitCampaignPrompt queueCount={900} senderClass="ca_local" overrideActive={overrideActive} />,
    }], { initialEntries: ["/workspaces/w1/campaigns/9/settings"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("alert").className).toMatch(/\bbg-warning\//);
    expect(screen.getByRole("alert")).not.toHaveClass("bg-brand-wash");
    expect(screen.getByRole("button", { name: overrideActive ? "Remove override" : "Send on this local number anyway" })).toBeEnabled();
  });

  test("stored webhook drift is a warning rather than a neutral summary", () => {
    const onboarding = onboardingFixture();
    onboarding.subaccountBootstrap.driftMessages = ["The voice callback is out of date."];
    const router = createMemoryRouter([{
      path: "/admin/workspaces/w1/twilio",
      Component: () => <HealthPanel onboarding={onboarding} syncSnapshot={{
        accountStatus: null, accountFriendlyName: null, phoneNumberCount: 0,
        numberTypes: [], senderTypes: [], recentUsageCount: 0, usageTotalPrice: null,
        lastSyncedAt: null, lastSyncStatus: "never_synced", lastSyncError: null,
      }} />,
    }], { initialEntries: ["/admin/workspaces/w1/twilio"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("alert").className).toMatch(/\bbg-warning\//);
    expect(screen.getByText("The voice callback is out of date.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repair webhooks" })).toBeEnabled();
  });

  test.each(["warning", "info"] as const)("provider recommendation preserves its explicit meaning: %s", (severity) => {
    const router = createMemoryRouter([{
      path: "/admin/workspaces/w1/twilio",
      Component: () => <OperationalGuidancePanel config={makePortalConfig()} detectedTrafficClass="unknown"
        recommendations={[{ severity, message: "Review the configured send rate." }]} supportRequestSummary="Fixture summary" />,
    }], { initialEntries: ["/admin/workspaces/w1/twilio"] });
    render(<RouterProvider router={router} />);
    const notice = screen.getByRole("alert");
    if (severity === "warning") expect(notice.className).toMatch(/\bbg-warning\//);
    else expect(notice).toHaveClass("bg-card");
    expect(within(notice).getByText("Review the configured send rate.")).toBeInTheDocument();
  });

  test("the actual MFA setup form uses the warning tone after its fetcher result", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter([
      { path: "/account", Component: Account, loader: () => ({
        firstName: "Test", lastName: "User", email: "test@example.com",
        twoFactorEnabled: false, twoFactorAvailable: true, privileged: true, enrollRequired: true,
      }) },
      { path: "/account/security", action: () => ({ step: "verify", totpURI: "otpauth://totp/Fixture?secret=LOCALTEST" }) },
    ], { initialEntries: ["/account"] });
    render(<RouterProvider router={router} />);
    await user.type(await screen.findByLabelText(/Current password/), "test-password");
    await user.click(screen.getByRole("button", { name: "Save", exact: true }));
    const heading = await screen.findByText("Connect your authenticator app");
    expect(observeTone).toHaveBeenLastCalledWith("warning");
    expect(heading.closest('[data-slot="alert"]')?.className).toMatch(/\bbg-warning\//);
    expect(screen.getByLabelText(/Verification code/)).toBeRequired();
    expect(screen.getByText("MFA enrollment is required before you can access your workspace.")).toBeInTheDocument();
  });
});
