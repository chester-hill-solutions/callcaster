import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { CampaignSettings } from "@/components/campaign/settings/CampaignSettings";

vi.mock("@/components/campaign/settings/basic/CampaignBasicInfo", () => ({
  CampaignBasicInfo: () => null,
}));
vi.mock("@/components/campaign/settings/detailed/CampaignDetailed", () => ({
  CampaignTypeSpecificSettings: () => null,
}));
vi.mock("@/components/campaign/settings/CampaignSettingsQueue", () => ({
  CampaignSettingsQueue: () => null,
}));
vi.mock("@/components/campaign/settings/CampaignCostPanel", () => ({
  CampaignCostPanel: () => null,
}));

function renderLaunchReview(readinessIssues: string[] = []) {
  const props = {
    campaignData: {
      id: 9,
      type: "message",
      title: "Summer outreach",
      caller_id: "+15555550100",
      start_date: "2026-07-20T00:00:00.000Z",
      end_date: "2026-07-31T00:00:00.000Z",
      status: "draft",
    },
    campaignDetails: {
      campaign_id: 9,
      workspace: "ws-1",
      body_text: "Hello from the campaign",
      message_media: [],
    },
    flags: {},
    workspace: "ws-1",
    isActive: false,
    scripts: [],
    audiences: [],
    mediaData: [],
    campaign_id: "9",
    isChanged: false,
    phoneNumbers: [],
    handleInputChange: vi.fn(),
    handleDuplicateButton: vi.fn(),
    handleStatusButton: vi.fn(),
    handleScheduleButton: vi.fn(),
    formFetcher: { state: "idle" },
    user: { id: "user-1" },
    startDisabledReason: readinessIssues[0] ?? null,
    readinessIssues,
    campaignQueue: [],
    queueCount: 25,
    dequeuedCount: 0,
    totalCount: 25,
    mediaLinks: [],
    handleNavigate: vi.fn(),
    scheduleDisabled: false,
    handleConfirmStatus: vi.fn(),
    confirmStatus: "play",
    isBusy: false,
    isSaving: false,
    activeIntent: null,
    credits: 100,
    surveys: [],
    outboundEstimateInputs: {
      portalConfig: {},
      syncSnapshot: {},
    },
    setupGuideLaunchActionLabel: "Start text campaign",
  } as never;

  const router = createMemoryRouter(
    [{ path: "/", element: <CampaignSettings {...props} /> }],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
}

describe("campaign launch review", () => {
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
      screen.getByText("Message content or media is required"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start text campaign" }),
    ).toBeDisabled();
  });
});
