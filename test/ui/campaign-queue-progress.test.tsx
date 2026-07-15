import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import {
  CampaignQueueProgress,
  campaignQueueProgressTooltip,
} from "@/components/campaign/CampaignQueueProgress";

describe("CampaignQueueProgress", () => {
  test("renders completed/total and tooltip text", async () => {
    render(
      <CampaignQueueProgress completedCount={142} totalCount={500} />,
    );

    expect(screen.getByTestId("campaign-queue-progress")).toHaveTextContent(
      "142 / 500",
    );

    await userEvent.hover(screen.getByTestId("campaign-queue-progress"));
    expect(campaignQueueProgressTooltip(142, 500)).toBe("358 left");
  });

  test("renders nothing when total is zero", () => {
    render(<CampaignQueueProgress completedCount={0} totalCount={0} />);
    expect(screen.queryByTestId("campaign-queue-progress")).toBeNull();
  });
});
