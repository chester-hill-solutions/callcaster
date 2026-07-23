import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  CampaignLaunchActions,
  getCampaignLaunchButtonStates,
} from "@/components/campaign/settings/CampaignLaunchActions";

describe("getCampaignLaunchButtonStates", () => {
  test("marks the running campaign play control as active", () => {
    expect(getCampaignLaunchButtonStates("running", false)).toEqual({
      play: "Active",
      pause: "Inactive",
      archive: "Inactive",
      schedule: "Disabled",
    });
  });

  test("disables start and schedule when play is blocked in draft", () => {
    expect(getCampaignLaunchButtonStates("draft", true)).toEqual({
      play: "Disabled",
      pause: "Inactive",
      archive: "Inactive",
      schedule: "Disabled",
    });
  });
});

describe("CampaignLaunchActions", () => {
  test("renders a primary start CTA in draft when ready", () => {
    render(
      <CampaignLaunchActions
        status="draft"
        startLabel="Start calling"
        isMessageCampaign={false}
        startDisabledReason={null}
        scheduleDisabled={false}
        isBusy={false}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onSchedule={vi.fn()}
        onArchive={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    const play = screen.getByTestId("campaign-launch-play");
    expect(play).toBeEnabled();
    expect(play).toHaveAttribute("data-state", "inactive");
    expect(play).toHaveAttribute("data-variant", "default");
    expect(play).toHaveTextContent("Start calling");
  });

  test("shows the current running state as pressed and unavailable", () => {
    render(
      <CampaignLaunchActions
        status="running"
        startLabel="Start calling"
        isMessageCampaign={false}
        startDisabledReason={null}
        scheduleDisabled={false}
        isBusy={false}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onSchedule={vi.fn()}
        onArchive={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    const play = screen.getByTestId("campaign-launch-play");
    expect(play).toBeDisabled();
    expect(play).toHaveAttribute("aria-pressed", "true");
    expect(play).toHaveAttribute("data-state", "active");
    expect(play).toHaveTextContent("Running");

    const pause = screen.getByTestId("campaign-launch-pause");
    expect(pause).toBeEnabled();
    expect(pause).toHaveAttribute("data-state", "inactive");
    expect(pause).toHaveAttribute("data-variant", "default");
  });

  test("holds the start action when readiness blocks launch", () => {
    render(
      <CampaignLaunchActions
        status="draft"
        startLabel="Start text campaign"
        isMessageCampaign={true}
        startDisabledReason="Message content or media is required"
        scheduleDisabled="Message content or media is required"
        isBusy={false}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onSchedule={vi.fn()}
        onArchive={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    expect(screen.getByTestId("campaign-launch-play")).toBeDisabled();
    expect(screen.getByTestId("campaign-launch-schedule")).toBeDisabled();
  });
});
