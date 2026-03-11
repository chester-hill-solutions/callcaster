import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/logger.client", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("useSupabaseRoom", () => {
  test("uses a workspace-scoped room name and does not resubscribe on status updates", async () => {
    const on = vi.fn().mockReturnThis();
    const subscribe = vi.fn((callback?: (status: string) => void) => {
      callback?.("CHANNEL_ERROR");
      return {};
    });
    const room = {
      on,
      subscribe,
      presenceState: vi.fn(() => ({})),
    };
    const supabase = {
      channel: vi.fn(() => room),
      removeChannel: vi.fn(),
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    } as any;

    const { default: useSupabaseRoom } = await import("@/hooks/call/useSupabaseRoom");

    renderHook(() =>
      useSupabaseRoom({
        supabase,
        workspace: "w1",
        campaign: 42,
        userId: "u1",
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(supabase.channel).toHaveBeenCalledTimes(1);
    expect(supabase.channel).toHaveBeenCalledWith("w1:42:u1");
  });
});
