import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { toast } from "sonner";

const mocks = vi.hoisted(() => ({
  revalidate: vi.fn(),
  fetcher: {
    state: "idle" as "idle" | "submitting" | "loading",
    data: undefined as
      | { audio: { name: string; path: string; signed_url: string | null } }
      | { error: string }
      | undefined,
    submit: vi.fn(),
  },
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useFetcher: () => mocks.fetcher,
    useRevalidator: () => ({ revalidate: mocks.revalidate }),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { AddAudioSheet } from "@/components/campaign/settings/AddAudioSheet";
import { CampaignVoiceSettings } from "@/components/campaign/settings/basic/CampaignVoiceSettings";

describe("AddAudioSheet", () => {
  beforeEach(() => {
    mocks.revalidate.mockReset();
    mocks.fetcher.submit.mockReset();
    mocks.fetcher.state = "idle";
    mocks.fetcher.data = undefined;
    vi.clearAllMocks();
  });

  test("renders upload fields when open", () => {
    render(
      <AddAudioSheet
        workspaceId="ws-1"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add audio" })).toBeInTheDocument();
    expect(screen.getByLabelText(/audio name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload audio/i })).toBeInTheDocument();
  });

  test("closes, toasts, and revalidates after a successful upload", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <AddAudioSheet
        workspaceId="ws-1"
        open
        onOpenChange={onOpenChange}
      />,
    );

    mocks.fetcher.state = "submitting";
    rerender(
      <AddAudioSheet
        workspaceId="ws-1"
        open
        onOpenChange={onOpenChange}
      />,
    );

    mocks.fetcher.state = "idle";
    mocks.fetcher.data = {
      audio: {
        name: "intro.mp3",
        path: "ws-1/intro.mp3",
        signed_url: null,
      },
    };

    act(() => {
      rerender(
        <AddAudioSheet
          workspaceId="ws-1"
          open
          onOpenChange={onOpenChange}
        />,
      );
    });

    expect(toast.success).toHaveBeenCalledWith("Uploaded intro.mp3");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.revalidate).toHaveBeenCalled();
  });

  test("flattens a multi-line audio name onto one inline toast line (#1667)", () => {
    const { rerender } = render(
      <AddAudioSheet workspaceId="ws-1" open onOpenChange={() => undefined} />,
    );
    mocks.fetcher.state = "submitting";
    rerender(
      <AddAudioSheet workspaceId="ws-1" open onOpenChange={() => undefined} />,
    );
    mocks.fetcher.state = "idle";
    mocks.fetcher.data = {
      audio: { name: "My\nrecording.mp3", path: "ws-1/My recording.mp3", signed_url: null },
    };
    act(() => {
      rerender(
        <AddAudioSheet workspaceId="ws-1" open onOpenChange={() => undefined} />,
      );
    });

    expect(toast.success).toHaveBeenCalledWith("Uploaded My recording.mp3");
  });

  test("surfaces upload errors without closing", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <AddAudioSheet
        workspaceId="ws-1"
        open
        onOpenChange={onOpenChange}
      />,
    );

    mocks.fetcher.state = "submitting";
    rerender(
      <AddAudioSheet
        workspaceId="ws-1"
        open
        onOpenChange={onOpenChange}
      />,
    );

    mocks.fetcher.state = "idle";
    mocks.fetcher.data = { error: "An audio file with that name already exists. Choose a different name." };

    act(() => {
      rerender(
        <AddAudioSheet
          workspaceId="ws-1"
          open
          onOpenChange={onOpenChange}
        />,
      );
    });

    expect(toast.error).toHaveBeenCalledWith(
      "An audio file with that name already exists. Choose a different name.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "An audio file with that name already exists. Choose a different name.",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe("CampaignVoiceSettings add audio trigger", () => {
  beforeEach(() => {
    mocks.fetcher.state = "idle";
    mocks.fetcher.data = undefined;
    vi.clearAllMocks();
  });

  test("opens the add audio sheet from the Setup voicemail controls (#1839)", async () => {
    const user = userEvent.setup();
    render(
      <CampaignVoiceSettings
        campaignData={
          {
            id: 1,
            type: "live_call",
            title: "Live",
            workspace: "ws-1",
            caller_id: "+15555550100",
            status: "draft",
            voicemail_file: null,
            voicemail_drop_enabled: false,
            voicedrop_audio: null,
          } as never
        }
        mediaData={[]}
        handleInputChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("heading", { name: "Add audio" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add audio/i }));

    expect(screen.getByRole("heading", { name: "Add audio" })).toBeInTheDocument();
  });
});
