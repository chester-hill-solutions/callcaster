import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import SelectNumber from "@/components/campaign/settings/basic/CampaignBasicInfo.SelectNumber";
import SelectType from "@/components/campaign/settings/basic/CampaignBasicInfo.SelectType";
import SelectScript from "@/components/campaign/settings/detailed/CampaignDetailed.SelectScript";
import SelectVoicemail from "@/components/campaign/settings/detailed/CampaignDetailed.Voicemail";
import SelectVoiceDrop from "@/components/campaign/settings/detailed/live/CampaignDetailed.Live.SelectVoiceDrop";

describe("campaign settings orphan values", () => {
  test("shows IVR types and preserves an unsupported current type", () => {
    render(
      <SelectType
        campaignData={{ type: "email" } as never}
        handleInputChange={vi.fn()}
      />,
    );

    fireEvent.click(document.querySelector("#type")!);
    expect(screen.getByText("Simple IVR")).toBeInTheDocument();
    expect(screen.getByText("Complex IVR")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "email — legacy (unsupported)" })).toHaveAttribute(
      "data-disabled",
    );
  });

  test("shows unavailable caller ID and script values", () => {
    const { container, unmount } = render(
      <SelectNumber
        campaignData={{ caller_id: "+15555550100" }}
        handleInputChange={vi.fn()}
        phoneNumbers={[]}
      />,
    );
    fireEvent.click(container.querySelector("#caller_id")!);
    expect(screen.getByRole("option", { name: "+15555550100 — unavailable" })).toHaveAttribute(
      "data-disabled",
    );
    unmount();

    const scriptRender = render(
      <SelectScript
        selectedScript={42}
        handleInputChange={vi.fn()}
        scripts={[]}
      />,
    );
    fireEvent.click(scriptRender.container.querySelector("#script_id")!);
    expect(screen.getByRole("option", { name: "Script 42 — unavailable" })).toHaveAttribute(
      "data-disabled",
    );
    expect(screen.getByRole("option", { name: "None" })).toBeInTheDocument();
  });

  test("shows unavailable media and allows explicit clearing", () => {
    const voicemailChange = vi.fn();
    const { container, unmount } = render(
      <SelectVoicemail
        campaignData={{ voicemail_file: "missing.mp3" }}
        handleInputChange={voicemailChange}
        mediaData={[]}
      />,
    );
    fireEvent.click(container.querySelector("#voicemail_file")!);
    expect(screen.getByRole("option", { name: "missing.mp3 — unavailable" })).toHaveAttribute(
      "data-disabled",
    );
    fireEvent.click(screen.getByRole("option", { name: "None" }));
    expect(voicemailChange).toHaveBeenCalledWith("voicemail_file", null);
    unmount();

    const voiceDropChange = vi.fn();
    const voiceDropRender = render(
      <SelectVoiceDrop
        campaignData={{ voicedrop_audio: "drop.mp3" }}
        handleInputChange={voiceDropChange}
        mediaData={[]}
      />,
    );
    fireEvent.click(voiceDropRender.container.querySelector("#voicedrop_audio")!);
    expect(screen.getByRole("option", { name: "drop.mp3 — unavailable" })).toHaveAttribute(
      "data-disabled",
    );
    fireEvent.click(screen.getByRole("option", { name: "None" }));
    expect(voiceDropChange).toHaveBeenCalledWith("voicedrop_audio", null);
  });
});
