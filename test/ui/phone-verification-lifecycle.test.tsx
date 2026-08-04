import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { toast } from "sonner";
import { usePhoneVerification } from "@/hooks/call/usePhoneVerification";

const verifyFetcher = {
  data: undefined as
    | {
        success?: boolean;
        verificationId?: string;
        phoneNumber?: string;
        error?: string;
      }
    | undefined,
  load: vi.fn(),
  state: "idle",
};

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useFetcher: () => verifyFetcher };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("phone verification lifecycle", () => {
  beforeEach(() => {
    verifyFetcher.data = undefined;
    verifyFetcher.load.mockReset();
    vi.clearAllMocks();
  });

  test("falls back to computer when the selected verified number is removed", () => {
    const { result, rerender } = renderHook(
      ({ verifiedNumbers }) => usePhoneVerification({ verifiedNumbers }),
      { initialProps: { verifiedNumbers: ["+15551234567"] } },
    );

    act(() => {
      void result.current.handlePhoneDeviceSelection("+15551234567", vi.fn());
    });
    expect(result.current.selectedDevice).toBe("+15551234567");
    expect(result.current.phoneConnectionStatus).toBe("disconnected");

    rerender({ verifiedNumbers: [] });

    expect(result.current.selectedDevice).toBe("computer");
    expect(result.current.phoneConnectionStatus).toBe("disconnected");
  });

  test("uses call-in verification and reports failures without success toast", () => {
    const { result, rerender } = renderHook(() =>
      usePhoneVerification({ verifiedNumbers: [] }),
    );

    act(() => result.current.setNewPhoneNumber("+15551234567"));
    act(() => result.current.handleVerifyNewNumber());
    expect(verifyFetcher.load).toHaveBeenCalledWith(
      "/api/verify-call-in-session?phoneNumber=%2B15551234567",
    );

    verifyFetcher.data = { error: "Verification unavailable" };
    rerender();
    expect(toast.error).toHaveBeenCalledWith("Verification unavailable");
    expect(toast.success).not.toHaveBeenCalled();
    expect(result.current.verificationPhoneNumber).toBe("");

    verifyFetcher.data = {
      success: true,
      verificationId: "verification-1",
      phoneNumber: "+15550009999",
    };
    rerender();
    expect(result.current.verificationPhoneNumber).toBe("+15550009999");
  });
});
