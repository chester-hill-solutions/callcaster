import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/logger.client", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe("useCallRoom", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("connects to workspace SSE and does not resubscribe on status updates", async () => {
    const MockEventSource = vi.fn(function MockEventSource(this: {
      url: string;
      onopen: ((event: Event) => void) | null;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }, url: string) {
      this.url = url;
      this.onopen = null;
      this.addEventListener = vi.fn();
      this.removeEventListener = vi.fn();
      this.close = vi.fn();
      queueMicrotask(() => this.onopen?.(new Event("open")));
    });

    vi.stubGlobal("EventSource", MockEventSource);

    const client = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    } as any;

    const { default: useCallRoom } = await import("@/hooks/call/useCallRoom");

    renderHook(() =>
      useCallRoom({
        client,
        workspace: "w1",
        campaign: 42,
        userId: "u1",
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(EventSource).toHaveBeenCalledTimes(1);
    expect(EventSource).toHaveBeenCalledWith("/api/workspaces/w1/events");
  });
});
