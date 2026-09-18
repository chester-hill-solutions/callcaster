import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/campaign/settings/AddAudioSheet", () => ({
  AddAudioSheet: () => null,
}));

import { CampaignVoicemailSettings } from "@/components/campaign/settings/basic/CampaignBasicInfo.Voicemail";

const baseCampaign = {
  id: 1,
  title: "C",
  workspace: "ws-1",
  status: "draft",
  voicemail_file: null,
  voicemail_drop_enabled: false,
  voicedrop_audio: null,
};

describe("CampaignVoicemailSettings (#1839)", () => {
  test("renders nothing for a text campaign", () => {
    const { container } = render(
      <CampaignVoicemailSettings
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
        <CampaignVoicemailSettings
          campaignData={{ ...baseCampaign, type } as never}
          mediaData={[]}
          handleInputChange={vi.fn()}
        />,
      );
      expect(screen.getByRole("switch", { name: /voicemail drop/i })).toBeInTheDocument();
      expect(document.querySelector("#voicemail_file")).toBeInTheDocument();
    },
  );

  test("toggling reports the boolean to handleInputChange", () => {
    const change = vi.fn();
    render(
      <CampaignVoicemailSettings
        campaignData={{ ...baseCampaign, type: "robocall" } as never}
        mediaData={[]}
        handleInputChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /voicemail drop/i }));
    expect(change).toHaveBeenCalledWith("voicemail_drop_enabled", true);
  });

  test("shows the live voice drop only for live calling", () => {
    const { rerender } = render(
      <CampaignVoicemailSettings
        campaignData={{ ...baseCampaign, type: "live_call" } as never}
        mediaData={[]}
        handleInputChange={vi.fn()}
      />,
    );
    expect(document.querySelector("#voicedrop_audio")).toBeInTheDocument();

    rerender(
      <CampaignVoicemailSettings
        campaignData={{ ...baseCampaign, type: "robocall" } as never}
        mediaData={[]}
        handleInputChange={vi.fn()}
      />,
    );
    expect(document.querySelector("#voicedrop_audio")).not.toBeInTheDocument();
  });
});
