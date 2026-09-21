import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/campaign/settings/AddAudioSheet", () => ({
  AddAudioSheet: () => null,
}));

import { CampaignVoiceSettings } from "@/components/campaign/settings/basic/CampaignVoiceSettings";

const baseCampaign = {
  id: 1,
  title: "C",
  workspace: "ws-1",
  status: "draft",
  voicemail_file: null,
  voicemail_drop_enabled: false,
  voicedrop_audio: null,
  group_household_queue: false,
  dial_type: "call",
};

describe("CampaignVoiceSettings (#1839, #1863)", () => {
  test("renders nothing for a text campaign", () => {
    const { container } = render(
      <CampaignVoiceSettings
        campaignData={{ ...baseCampaign, type: "message" } as never}
        mediaData={[]}
        handleInputChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test.each(["robocall", "simple_ivr", "complex_ivr", "live_call"])(
    "shows the voicemail drop toggle and audio picker for %s",
    (type) => {
      render(
        <CampaignVoiceSettings
          campaignData={{ ...baseCampaign, type } as never}
          mediaData={[]}
          handleInputChange={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("switch", { name: /voicemail drop/i }),
      ).toBeInTheDocument();
      expect(document.querySelector("#voicemail_file")).toBeInTheDocument();
    },
  );

  test("toggling reports the boolean to handleInputChange", () => {
    const change = vi.fn();
    render(
      <CampaignVoiceSettings
        campaignData={{ ...baseCampaign, type: "robocall" } as never}
        mediaData={[]}
        handleInputChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /voicemail drop/i }));
    expect(change).toHaveBeenCalledWith("voicemail_drop_enabled", true);
  });

  test("shows the live voice drop and calling options only for live calling", () => {
    const { rerender } = render(
      <CampaignVoiceSettings
        campaignData={{ ...baseCampaign, type: "live_call" } as never}
        mediaData={[]}
        handleInputChange={vi.fn()}
      />,
    );
    expect(document.querySelector("#voicedrop_audio")).toBeInTheDocument();
    expect(screen.getByText("Calling options")).toBeInTheDocument();
    expect(document.querySelector("#group_household_queue")).toBeInTheDocument();
    expect(document.querySelector("#dial_type")).toBeInTheDocument();

    rerender(
      <CampaignVoiceSettings
        campaignData={{ ...baseCampaign, type: "robocall" } as never}
        mediaData={[]}
        handleInputChange={vi.fn()}
      />,
    );
    expect(document.querySelector("#voicedrop_audio")).not.toBeInTheDocument();
    expect(screen.queryByText("Calling options")).not.toBeInTheDocument();
    expect(document.querySelector("#dial_type")).not.toBeInTheDocument();
  });

  test("reports household grouping and dial type changes", () => {
    const change = vi.fn();
    render(
      <CampaignVoiceSettings
        campaignData={{ ...baseCampaign, type: "live_call" } as never}
        mediaData={[]}
        handleInputChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /group by household/i }));
    expect(change).toHaveBeenCalledWith("group_household_queue", true);

    fireEvent.click(screen.getByRole("switch", { name: /dial type/i }));
    expect(change).toHaveBeenCalledWith("dial_type", "predictive");
  });
});
