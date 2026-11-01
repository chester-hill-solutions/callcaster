import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TopChrome } from "@/components/call/CallScreen.Header";

vi.hoisted(() => { process.env.TZ = "UTC"; });

function props() {
  return {
    campaign: { id: 7, title: "Outreach" },
    workspaceId: "workspace-a",
    count: 100,
    completed: 10,
    availableCredits: 200,
    creditState: "GOOD" as const,
    hasAccess: true,
    predictive: false,
    isTalking: false,
    onLeaveCampaign: vi.fn(),
    onReportError: vi.fn(),
  };
}

function expectTimes(session: string, talk: string) {
  expect(screen.getByRole("timer", { name: "Calling session elapsed time" })).toHaveTextContent(`Session ${session}`);
  expect(screen.getByRole("timer", { name: "Calling session talk time" })).toHaveTextContent(`Talk ${talk}`);
}

function advance(milliseconds: number) {
  act(() => { vi.advanceTimersByTime(milliseconds); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("calling session and talk timers (#2533)", () => {
  test.each([false, true])("shows both timers while waiting (predictive: %s)", (predictive) => {
    render(<TopChrome {...props()} predictive={predictive} />);
    expectTimes("00:00:00", "00:00:00");
    advance(65_000);
    expectTimes("00:01:05", "00:00:00");
  });

  test("adds connected time across calls and pauses talk time between them", () => {
    const initial = props();
    const { rerender } = render(<TopChrome {...initial} />);
    advance(5_000);
    rerender(<TopChrome {...initial} isTalking />);
    advance(12_000);
    expectTimes("00:00:17", "00:00:12");
    rerender(<TopChrome {...initial} />);
    advance(8_000);
    expectTimes("00:00:25", "00:00:12");
    rerender(<TopChrome {...initial} isTalking />);
    advance(7_000);
    rerender(<TopChrome {...initial} />);
    advance(2_000);
    expectTimes("00:00:34", "00:00:19");
  });

  test("retains fractional connected time across short calls", () => {
    const initial = props();
    const { rerender } = render(<TopChrome {...initial} isTalking />);
    advance(600);
    rerender(<TopChrome {...initial} />);
    advance(900);
    rerender(<TopChrome {...initial} isTalking />);
    advance(600);
    rerender(<TopChrome {...initial} />);
    expectTimes("00:00:02", "00:00:01");
  });

  test("uses elapsed clock time when browser callbacks are delayed", () => {
    const initial = props();
    const { rerender } = render(<TopChrome {...initial} isTalking />);
    vi.setSystemTime(new Date("2026-10-31T12:05:00Z"));
    advance(1_000);
    expectTimes("00:05:01", "00:05:01");
    rerender(<TopChrome {...initial} />);
    vi.setSystemTime(new Date("2026-10-31T12:10:00Z"));
    advance(1_000);
    expectTimes("00:10:01", "00:05:01");
  });

  test("keeps totals while queue data and campaign titles refresh", () => {
    const initial = props();
    const { rerender } = render(<TopChrome {...initial} isTalking />);
    advance(10_000);
    rerender(<TopChrome {...initial} isTalking predictive count={120} completed={40}
      campaign={{ id: 7, title: "Renamed outreach" }} />);
    advance(8_000);
    expectTimes("00:00:18", "00:00:18");
    expect(screen.getByText("80 of 120 remaining")).toBeInTheDocument();
  });

  test.each(["campaign", "workspace"])("starts new totals after changing %s", (scope) => {
    const initial = props();
    const { rerender } = render(<TopChrome {...initial} isTalking />);
    advance(30_000);
    expectTimes("00:00:30", "00:00:30");
    rerender(<TopChrome {...initial} isTalking
      workspaceId={scope === "workspace" ? "workspace-b" : initial.workspaceId}
      campaign={scope === "campaign" ? { id: 8, title: "Outreach" } : initial.campaign} />);
    expectTimes("00:00:00", "00:00:00");
    advance(2_000);
    expectTimes("00:00:02", "00:00:02");
  });

  test("cleans up on leaving and starts a new visit at zero", () => {
    const { unmount } = render(<TopChrome {...props()} isTalking />);
    advance(37_000);
    expectTimes("00:00:37", "00:00:37");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    render(<TopChrome {...props()} />);
    expectTimes("00:00:00", "00:00:00");
  });

  test("shows hours without wrapping after one day", () => {
    render(<TopChrome {...props()} isTalking />);
    vi.setSystemTime(new Date("2026-11-01T14:03:04Z"));
    advance(1_000);
    expectTimes("26:03:05", "26:03:05");
  });

  test("keeps second-by-second changes quiet for screen readers", () => {
    render(<TopChrome {...props()} />);
    expect(screen.getByRole("timer", { name: "Calling session elapsed time" })).toHaveAttribute("aria-live", "off");
    expect(screen.getByRole("timer", { name: "Calling session talk time" })).toHaveAttribute("aria-live", "off");
  });
});
