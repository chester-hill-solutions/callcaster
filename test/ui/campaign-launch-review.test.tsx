import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { getCampaignReadiness } from "@/lib/campaign-readiness";
import { CampaignLaunch } from "@/components/campaign/settings/CampaignLaunch";

vi.mock("@/components/campaign/settings/detailed/CampaignLaunchExtras", () => ({
  CampaignLaunchExtras: () => null,
}));
vi.mock("@/components/campaign/settings/CampaignCostPanel", () => ({
  CampaignCostPanel: ({ billing }: { billing?: unknown }) => (
    <div data-testid="campaign-cost-panel" data-has-billing={billing ? "yes" : "no"} />
  ),
}));

function renderLaunchReview(
  readinessIssues: string[] = [],
  campaignBilling: unknown = null,
  options: { isBusy?: boolean; campaign?: Record<string, unknown> } = {},
) {
  const handleConfirmStatus = vi.fn();
  const props = {
    campaignData: {
      id: 9,
      type: "message",
      title: "Summer outreach",
      caller_id: "+15555550100",
      start_date: "2026-07-20T00:00:00.000Z",
      end_date: "2026-07-31T00:00:00.000Z",
      status: "draft",
      ...options.campaign,
    },
    campaignDetails: {
      campaign_id: 9,
      workspace: "ws-1",
      body_text: "Hello from the campaign",
      message_media: [],
    },
    workspace: "ws-1",
    scripts: [],
    mediaData: [],
    isChanged: false,
    phoneNumbers: [],
    handleInputChange: vi.fn(),
    handleDuplicateButton: vi.fn(),
    handleStatusButton: vi.fn(),
    handleScheduleButton: vi.fn(),
    formFetcher: { state: "idle" },
    startDisabledReason: readinessIssues[0] ?? null,
    readinessIssues,
    queueCount: 25,
    dequeuedCount: 0,
    scheduleDisabled: false,
    handleConfirmStatus,
    confirmStatus: "play",
    isBusy: options.isBusy ?? false,
    isSaving: false,
    activeIntent: null,
    credits: 100,
    outboundEstimateInputs: {
      portalConfig: {},
      syncSnapshot: {},
    },
    launchActionLabelOverride: "Start text campaign",
    campaignBilling,
  } as never;

  const router = createMemoryRouter(
    [{ path: "/", element: <CampaignLaunch {...props} /> }],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return handleConfirmStatus;
}

describe("campaign launch review", () => {
  test("requires deliberate unrestricted SMS consent while allowing launch", async () => {
    const confirm = renderLaunchReview([], null, { campaign: { schedule: { monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] } } } });
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent(/any hour, including overnight/);
    expect(warning).toHaveTextContent(/voice schedule does not restrict SMS/);
    expect(confirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Start text campaign" }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith("play");
  });

  test("Cancel does not confirm a launch", async () => {
    const confirm = renderLaunchReview();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith("none");
    expect(confirm).not.toHaveBeenCalledWith("play");
  });

  test("Escape cancels an open review without confirming a launch", async () => {
    const confirm = renderLaunchReview();
    await userEvent.keyboard("{Escape}");
    expect(confirm).toHaveBeenCalledExactlyOnceWith("none");
    expect(confirm).not.toHaveBeenCalledWith("play");
  });

  test("a pending confirmation cannot submit again", async () => {
    const confirm = renderLaunchReview([], null, { isBusy: true });
    const button = screen.getByRole("button", { name: "Start text campaign" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(confirm).not.toHaveBeenCalled();
  });

  test("a valid SMS window has no unrestricted warning", () => {
    renderLaunchReview([], null, { campaign: { sms_send_window: { monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] } } } });
    expect(screen.queryByText(/Are you sure you want unrestricted SMS/)).not.toBeInTheDocument();
  });

  test("summarizes launch inputs and goal-aware action", () => {
    renderLaunchReview();

    expect(screen.getByTestId("campaign-launch-review")).toHaveTextContent(
      "+15555550100",
    );
    expect(screen.getByTestId("campaign-launch-review")).toHaveTextContent(
      "Hello from the campaign",
    );
    expect(screen.getByTestId("campaign-launch-review")).toHaveTextContent(
      "25 contacts",
    );
    expect(screen.getByTestId("campaign-launch-review")).toHaveTextContent(
      "100 available",
    );
    expect(
      screen.getByRole("button", { name: "Start text campaign" }),
    ).toBeEnabled();
  });

  test("shows blockers and holds the launch action", () => {
    renderLaunchReview(["Message content or media is required"]);

    expect(screen.getByText("Complete before launch")).toBeInTheDocument();
    expect(
      screen.getAllByText("Message content or media is required").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Start text campaign" }),
    ).toBeDisabled();
  });

  test("expired readiness replaces the ready banner and disables Start", () => {
    const readiness = getCampaignReadiness({
      type: "message", caller_id: "+15555550100", start_date: "2026-10-01T00:00:00Z",
      end_date: "2026-10-02T23:59:59Z", schedule: null, sms_send_window: null,
    } as never, { body_text: "Hello", message_media: [] } as never, {
      queueCount: 25, now: new Date("2026-10-03T00:00:00Z"),
    });
    renderLaunchReview(readiness.startIssues);
    expect(screen.getByText("Complete before launch")).toBeInTheDocument();
    expect(screen.queryByText("Ready to launch.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start text campaign" })).toBeDisabled();
  });

  test("shows the campaign cost inline, not behind a disclosure (#1859)", () => {
    renderLaunchReview([], { estimate: { totalCredits: 12, rateDescription: "1 credit" } });

    const panel = screen.getByTestId("campaign-cost-panel");
    expect(panel).toHaveAttribute("data-has-billing", "yes");
    // The old <details><summary>Campaign cost</summary> wrapper is gone.
    expect(screen.queryByText("Campaign cost")).toBeNull();
    expect(document.querySelector("details")).toBeNull();
  });

  test("renders no cost panel when the campaign has no billing summary", () => {
    renderLaunchReview();

    expect(screen.queryByTestId("campaign-cost-panel")).toBeNull();
  });
});
