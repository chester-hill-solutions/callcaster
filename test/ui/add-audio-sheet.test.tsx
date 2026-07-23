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
import { CampaignLaunchExtras } from "@/components/campaign/settings/detailed/CampaignLaunchExtras";

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

describe("CampaignLaunchExtras add audio trigger", () => {
  beforeEach(() => {
    mocks.fetcher.state = "idle";
    mocks.fetcher.data = undefined;
    vi.clearAllMocks();
  });

  test("opens the add audio sheet from calling options", async () => {
    const user = userEvent.setup();
    render(
      <CampaignLaunchExtras
        campaignData={
          {
            id: 1,
            type: "live_call",
            title: "Live",
            caller_id: "+15555550100",
            status: "draft",
            voicemail_file: null,
            group_household_queue: false,
            dial_type: "call",
          } as never
        }
        handleInputChange={vi.fn()}
        mediaData={[]}
        details={{ campaign_id: 1, workspace: "ws-1" } as never}
        isBusy={false}
        queueCount={0}
        phoneNumbers={[]}
        outboundEstimateInputs={{
          portalConfig: {} as never,
          syncSnapshot: {} as never,
        }}
        workspaceId="ws-1"
      />,
    );

    expect(screen.queryByRole("heading", { name: "Add audio" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add audio/i }));

    expect(screen.getByRole("heading", { name: "Add audio" })).toBeInTheDocument();
  });
});
