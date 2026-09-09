import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLoaderData, redirect } from "react-router";
import type { ComponentProps } from "react";
import { describe, expect, test } from "vitest";
import { OnboardingFirstNumberStep } from "@/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep";
import { onboardingFixture, onboardingNumberFixture as number } from "../fixtures/onboarding";

type Props = ComponentProps<typeof OnboardingFirstNumberStep>;
const basePath = "/workspaces/w1/onboarding";


function renderFlow(step = "", overrides: Partial<Props> = {}) {
  const onboarding = onboardingFixture();
  onboarding.messagingService.serviceSid = "MG_test";
  const props: Props = {
    onboarding, workspaceId: "w1", phoneNumbers: [], creditsBalance: 0,
    isReadOnly: false, workspaceUsers: [], mediaNames: [], inboundQueues: [], scripts: [],
    pending: {
      isSavingWorkspaceName: false, isSavingBusinessProfile: false, isSavingChannels: false,
      isProvisioningA2P: false, isSavingRcs: false, isAttachingRcsSender: false,
      isReviewingEmergencyVoice: false, isVerifyingCallerId: false,
    },
    ...overrides,
  };
  const router = createMemoryRouter([{
    path: basePath,
    loader: () => props,
    action: async ({ request }) => {
      const form = await request.formData();
      if (form.get("_action") === "save_service_address") {
        props.onboarding.emergencyVoice.address = {
          ...props.onboarding.emergencyVoice.address,
          street: String(form.get("addressStreet")), city: String(form.get("addressCity")),
          region: String(form.get("addressRegion")), postalCode: String(form.get("addressPostalCode")),
        };
        return redirect(String(form.get("returnTo")));
      }
      return null;
    },
    Component: () => <OnboardingFirstNumberStep {...useLoaderData<Props>()} />,
  }], { initialEntries: [`${basePath}?step=first_number${step ? `&numberStep=${step}` : ""}`] });
  render(<RouterProvider router={router} />);
  return { router, props };
}

describe("guided phone setup (#1205)", () => {
  test("starts with a choice, then verifies without collecting a service address", async () => {
    renderFlow();
    fireEvent.click(await screen.findByRole("link", { name: "Use an existing number" }));
    expect(await screen.findByLabelText("Your phone number")).toBeEnabled();
    expect(screen.queryByLabelText("Street address")).toBeNull();
    expect(screen.queryByRole("group", { name: "Rent a Canadian number" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "When someone calls your number" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "1. Choose a method" }));
    expect(await screen.findByRole("link", { name: "Get a new number" })).toBeVisible();
  });

  test("requires an address before rental and keeps the rental path through billing", async () => {
    const { router } = renderFlow("rent");
    expect(await screen.findByLabelText(/Street address/)).toBeVisible();
    expect(screen.queryByRole("group", { name: "Rent a Canadian number" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Street address/), { target: { value: "123 Main St" } });
    fireEvent.change(screen.getByLabelText(/City/), { target: { value: "Toronto" } });
    fireEvent.change(screen.getByLabelText(/Province or region/), { target: { value: "ON" } });
    fireEvent.change(screen.getByLabelText(/Postal code/), { target: { value: "M5V 2T6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(await screen.findByRole("group", { name: "Rent a Canadian number" })).toBeVisible();
    const billing = screen.getByRole("link", { name: /Buy credits/i });
    const billingUrl = new URL(billing.getAttribute("href") ?? "", "http://localhost");
    expect(billingUrl.searchParams.get("returnTo")).toBe(`${basePath}?step=first_number&numberStep=rent`);
    await act(() => router.navigate(billingUrl.searchParams.get("returnTo") ?? ""));
    expect(screen.getByRole("group", { name: "Rent a Canadian number" })).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Back to service address" }));
    expect(await screen.findByRole("button", { name: "Edit address" })).toBeVisible();
  });

  test("shows routing after a rented number arrives and resumes there on an old rental URL", async () => {
    const { router, props } = renderFlow("rent");
    await screen.findByLabelText(/Street address/);
    props.phoneNumbers = [number()];
    await act(() => router.revalidate());
    expect(await screen.findByRole("heading", { name: "When someone calls your number" })).toBeVisible();
    expect(screen.queryByLabelText(/Street address/)).toBeNull();
    expect(screen.queryByRole("group", { name: "Rent a Canadian number" })).toBeNull();
    await act(() => router.navigate(`${basePath}?step=first_number&numberStep=rent`));
    expect(screen.getByText(/You have 1 rented number/)).toBeVisible();
  });

  test("resumes pending caller ID verification and completes without rented-number routing", async () => {
    const { router, props } = renderFlow("", {
      phoneNumbers: [number({ type: "caller_id", capabilities: { verification_status: "pending" } })],
    });
    expect(await screen.findByText("Awaiting verification")).toBeVisible();
    props.phoneNumbers = [number({ type: "caller_id", capabilities: { verification_status: "success" } })];
    await act(() => router.revalidate());
    await waitFor(() => expect(screen.getByText(/1 verified caller ID ready/)).toBeVisible());
    expect(screen.queryByRole("heading", { name: "When someone calls your number" })).toBeNull();
    expect(screen.queryByLabelText("Your phone number")).toBeNull();
  });

  test("members can read the selected path but cannot verify numbers", async () => {
    renderFlow("verify", { isReadOnly: true });
    expect(await screen.findByText(/Only workspace owners and admins can verify/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Verify number" })).toBeNull();
  });
});
