import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

describe("useCalls", () => {
  test("replaces recentCall when a new call is inserted", async () => {
    const { useCalls } = await import("@/hooks/queue/useCalls");

    const { result } = renderHook(() =>
      useCalls(
        [{ sid: "old", outreach_attempt_id: 1, contact_id: 1 } as any],
        { sid: "old", outreach_attempt_id: 1, contact_id: 1 } as any,
        [],
        vi.fn(),
        false,
      ),
    );

    act(() => {
      result.current.updateCalls(
        {
          new: { sid: "new", outreach_attempt_id: 2, contact_id: 2 } as any,
          eventType: "INSERT",
        },
        [],
        null,
        vi.fn(),
        vi.fn(),
        vi.fn(),
      );
    });

    expect(result.current.recentCall?.sid).toBe("new");
  });
});
