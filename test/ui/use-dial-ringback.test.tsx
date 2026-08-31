import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useDialRingback } from "@/hooks/call/useDialRingback";

function makeFakeAudioContext() {
  const oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const gainParam = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
  };
  const close = vi.fn().mockResolvedValue(undefined);
  class FakeAudioContext {
    currentTime = 0;
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
  return { FakeAudioContext, oscillators, gainParam, close };
}

describe("useDialRingback (#1341)", () => {
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

  test("plays a dual-frequency cadenced tone while active and tears down when dialing ends", () => {
    const { rerender, unmount } = renderHook(
      ({ active }: { active: boolean }) =>
        useDialRingback({ active, outputDeviceId: null }),
      { initialProps: { active: false } },
    );

    // Inactive: no audio graph at all.
    expect(fake.oscillators).toHaveLength(0);

    rerender({ active: true });
    // 440 + 480 Hz oscillators, both started, burst scheduled immediately.
    expect(fake.oscillators).toHaveLength(2);
    expect(fake.oscillators.every((o) => o.start.mock.calls.length === 1)).toBe(true);
    const burstsAfterStart = fake.gainParam.setValueAtTime.mock.calls.length;
    expect(burstsAfterStart).toBeGreaterThan(0);

    // Cadence keeps re-bursting while dialing continues.
    vi.advanceTimersByTime(6000);
    expect(fake.gainParam.setValueAtTime.mock.calls.length).toBeGreaterThan(
      burstsAfterStart,
    );

    // Dialing ends (connected/terminal): oscillators stop, context closes,
    // and no further bursts fire.
    rerender({ active: false });
    expect(fake.oscillators.every((o) => o.stop.mock.calls.length === 1)).toBe(true);
    expect(fake.close).toHaveBeenCalled();
    const burstsAfterStop = fake.gainParam.setValueAtTime.mock.calls.length;
    vi.advanceTimersByTime(12000);
    expect(fake.gainParam.setValueAtTime.mock.calls.length).toBe(burstsAfterStop);

    unmount();
  });
});
