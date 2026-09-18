import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { CampaignDialOptionsSettings } from "@/components/campaign/settings/basic/CampaignDialOptionsSettings";

const base = {
  id: 1,
  title: "C",
  workspace: "ws-1",
  status: "draft",
  group_household_queue: false,
  dial_type: "call",
};

describe("CampaignDialOptionsSettings (#1863)", () => {
  test("renders nothing for non-live campaigns", () => {
    const { container } = render(
      <CampaignDialOptionsSettings
        campaignData={{ ...base, type: "robocall" } as never}
        handleInputChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("reports household grouping changes", () => {
    const change = vi.fn();
    render(
      <CampaignDialOptionsSettings
        campaignData={{ ...base, type: "live_call" } as never}
        handleInputChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /group by household/i }));
    expect(change).toHaveBeenCalledWith("group_household_queue", true);
  });

  test("reports dial type changes", () => {
    const change = vi.fn();
    render(
      <CampaignDialOptionsSettings
        campaignData={{ ...base, type: "live_call" } as never}
        handleInputChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /dial type/i }));
    expect(change).toHaveBeenCalledWith("dial_type", "predictive");
  });
});
