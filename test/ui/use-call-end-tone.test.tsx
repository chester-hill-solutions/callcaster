import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useCallEndTone } from "@/hooks/call/useCallEndTone";

function makeFakeAudioContext() {
  const oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const gainParam = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
  };
  const close = vi.fn().mockResolvedValue(undefined);
  let created = 0;
  class FakeAudioContext {
    currentTime = 0;
    constructor() {
      created += 1;
    }
    createGain() {
      return { gain: gainParam, connect: vi.fn() };
    }
    createMediaStreamDestination() {
      return { stream: {} as MediaStream };
    }
    createOscillator() {
      const oscillator = {
        type: "sine",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }
    close = close;
  }
  return { FakeAudioContext, oscillators, gainParam, close, createdCount: () => created };
}

describe("useCallEndTone (#1363)", () => {
  let fake: ReturnType<typeof makeFakeAudioContext>;

  beforeEach(() => {
    vi.useFakeTimers();
    fake = makeFakeAudioContext();
    vi.stubGlobal("AudioContext", fake.FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function setup(initial: string) {
    return renderHook(
      ({ displayState }: { displayState: string }) =>
        useCallEndTone({ displayState, outputDeviceId: null }),
      { initialProps: { displayState: initial } },
    );
  }

  test("plays the bursts on connected → completed and tears down", () => {
    const { rerender } = setup("connected");
    expect(fake.createdCount()).toBe(0);

    rerender({ displayState: "completed" });
    expect(fake.createdCount()).toBe(1);
    vi.advanceTimersByTime(1200);
    // Two bursts (each = one on + one off setValueAtTime pair), then closed.
    expect(fake.gainParam.setValueAtTime.mock.calls.length).toBe(4);
    expect(fake.close).toHaveBeenCalled();
  });

  test("fires for the remote-hangup path too (dialing → no-answer)", () => {
    const { rerender } = setup("dialing");
    rerender({ displayState: "no-answer" });
    expect(fake.createdCount()).toBe(1);
  });

  test("does not fire when a terminal state renders without a live call before it", () => {
    const { rerender } = setup("idle");
    rerender({ displayState: "completed" });
    expect(fake.createdCount()).toBe(0);

    // Nor on terminal → terminal re-renders.
    rerender({ displayState: "failed" });
    expect(fake.createdCount()).toBe(0);
  });
});
