import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import { useCampaignExport } from "@/hooks/campaign";

/**
 * the admin and campaign export buttons were ~95% identical. They now
 * share this hook, so the flow is covered once.
 */
describe("useCampaignExport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test("posts the ids, polls to completion, and exposes the download URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ exportId: "e1", status: "started" })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "completed", downloadUrl: "https://dl" }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useCampaignExport({ campaignId: 7, workspaceId: "w1" }),
    );

    await act(async () => {
      await result.current.startExport();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("/api/campaign-export");
    expect(call?.[1]?.method).toBe("POST");
    const body = call?.[1]?.body as FormData;
    expect(body.get("campaignId")).toBe("7");
    expect(body.get("workspaceId")).toBe("w1");
    expect(toastMock.info).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.downloadUrl).toBe("https://dl");
    expect(toastMock.success).toHaveBeenCalled();
  });

  test("a failed start re-enables the button and toasts an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Campaign not found" }), {
          status: 404,
        }),
      ),
    );

    const { result } = renderHook(() =>
      useCampaignExport({ campaignId: 7, workspaceId: "w1" }),
    );
    await act(async () => {
      await result.current.startExport();
    });

    expect(result.current.isExporting).toBe(false);
    expect(toastMock.error).toHaveBeenCalledWith(
      "Export failed",
      expect.objectContaining({ description: "Campaign not found" }),
    );
  });

  test("cannot export without both ids", async () => {
    const { result } = renderHook(() =>
      useCampaignExport({ campaignId: null, workspaceId: "w1" }),
    );
    expect(result.current.canExport).toBe(false);

    await act(async () => {
      await result.current.startExport();
    });
    expect(result.current.isExporting).toBe(false);
    expect(toastMock.error).toHaveBeenCalled();
  });

  test("the shared button renders the idle label and disables without ids", async () => {
    const { CampaignExportButton } =
      await import("@/components/campaign/home/CampaignHomeScreen/CampaignExportButton");
    render(<CampaignExportButton campaignId={null} workspaceId={null} />);

    expect(
      screen.getByRole("button", { name: "Export Results" }),
    ).toBeDisabled();
  });
});
