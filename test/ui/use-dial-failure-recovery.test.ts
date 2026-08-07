import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useDialFailureRecovery } from "@/hooks/call/useDialFailureRecovery";

type HookProps = Parameters<typeof useDialFailureRecovery>[0];

function baseProps(overrides: Partial<HookProps> = {}): HookProps {
  return {
    fetcherState: "idle",
    fetcherData: undefined,
    send: vi.fn(),
    showError: vi.fn(),
    ...overrides,
  };
}

describe("useDialFailureRecovery", () => {
  test("does nothing while the fetcher has no settled data", () => {
    const send = vi.fn();
    renderHook((props: HookProps) => useDialFailureRecovery(props), {
      initialProps: baseProps({ fetcherState: "submitting", send }),
    });
    expect(send).not.toHaveBeenCalled();
  });

  test("does nothing on a settled success response", () => {
    const send = vi.fn();
    renderHook((props: HookProps) => useDialFailureRecovery(props), {
      initialProps: baseProps({
        fetcherState: "idle",
        fetcherData: {},
        send,
      }),
    });
    expect(send).not.toHaveBeenCalled();
  });

  // Regression: START_DIALING fires before the /api/dial POST settles (see
  // useCampaignDialActions), so a rejected dial — e.g. the atomic-claim 409
  // — otherwise left the status bar stuck on "Dialing…" with nothing to
  // hang up.
  test("dispatches FAIL and shows the message on a claim/credits/5xx error", () => {
    const send = vi.fn();
    const showError = vi.fn();
    renderHook((props: HookProps) => useDialFailureRecovery(props), {
      initialProps: baseProps({
        fetcherState: "idle",
        fetcherData: { error: "This contact is being dialed by another agent." },
        send,
        showError,
      }),
    });
    expect(send).toHaveBeenCalledWith({ type: "FAIL" });
    expect(showError).toHaveBeenCalledWith(
      "This contact is being dialed by another agent.",
    );
  });

  test("dispatches FAIL without a toast on a bare creditsError", () => {
    const send = vi.fn();
    const showError = vi.fn();
    renderHook((props: HookProps) => useDialFailureRecovery(props), {
      initialProps: baseProps({
        fetcherState: "idle",
        fetcherData: { creditsError: true },
        send,
        showError,
      }),
    });
    expect(send).toHaveBeenCalledWith({ type: "FAIL" });
    expect(showError).not.toHaveBeenCalled();
  });

  test("only fires once per settled rejection, not on every re-render", () => {
    const send = vi.fn();
    const props = baseProps({
      fetcherState: "idle",
      fetcherData: { error: "boom" },
      send,
    });
    const { rerender } = renderHook(
      (p: HookProps) => useDialFailureRecovery(p),
      { initialProps: props },
    );
    expect(send).toHaveBeenCalledTimes(1);
    rerender(props);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
