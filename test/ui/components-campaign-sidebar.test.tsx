import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import CampaignSidebar from "@/components/campaign/CampaignSidebar";
import { MemberRole } from "@/lib/member-role";
import type { Campaign } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useFetcher: () => ({
      state: "idle",
      data: undefined,
      formData: undefined,
      submit: mocks.submit,
    }),
  };
});

const campaigns = [
  {
    id: 1,
    title: "Running campaign",
    status: "running",
    created_at: "2026-10-20T12:00:00.000Z",
  },
  {
    id: 2,
    title: "Paused campaign",
    status: "paused",
    created_at: "2026-10-19T12:00:00.000Z",
  },
  {
    id: 3,
    title: "Archived campaign",
    status: "archived",
    created_at: "2026-10-18T12:00:00.000Z",
  },
] as unknown as Campaign[];

function renderSidebar(userRole = MemberRole.Admin) {
  return render(
    <MemoryRouter initialEntries={["/workspaces/ws-1/campaigns"]}>
      <CampaignSidebar
        workspaceId="ws-1"
        campaigns={campaigns}
        campaignQueueProgress={{
          "1": { completedCount: 4, totalCount: 10 },
        }}
        userRole={userRole}
      />
    </MemoryRouter>,
  );
}

describe("CampaignSidebar", () => {
  beforeEach(() => {
    mocks.submit.mockReset();
  });

  test("shows campaigns, progress, and status bars", () => {
    renderSidebar();

    expect(screen.getAllByText("Running campaign")).toHaveLength(1);
    expect(screen.getAllByText("Paused campaign")).toHaveLength(1);
    expect(screen.getByText("Archived campaign")).toBeInTheDocument();
    expect(screen.getAllByText("4 / 10")).toHaveLength(1);
  });

  test("offers pause and resume controls to campaign managers", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getAllByRole("button", { name: "Pause Running campaign" })[0]);
    expect(mocks.submit).toHaveBeenCalledWith(
      { intent: "status", status: "paused", campaignId: "1" },
      {
        method: "post",
        action: "/workspaces/ws-1/campaigns/1/settings",
      },
    );

    await user.click(screen.getAllByRole("button", { name: "Resume Paused campaign" })[0]);
    expect(mocks.submit).toHaveBeenCalledWith(
      { intent: "status", status: "running", campaignId: "2" },
      {
        method: "post",
        action: "/workspaces/ws-1/campaigns/2/settings",
      },
    );
  });

  test("does not expose management controls or New to callers", () => {
    renderSidebar(MemberRole.Caller);

    expect(screen.queryByRole("link", { name: "New" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /pause|resume/i }),
    ).toBeNull();
  });
});
