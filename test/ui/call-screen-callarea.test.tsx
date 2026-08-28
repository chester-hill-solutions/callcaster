import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild, children, ...props }: any) => {
    if (asChild) return <>{children}</>;
    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  formatTime: (seconds: number) => `t${seconds}`,
}));

// Bridge Radix Select to a native <select> so fireEvent.change tests keep
// working while production uses the real ui/select primitives.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <option value="">{placeholder}</option>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
}));

function makeRecipient(overrides: Partial<any> = {}) {
  return {
    contact: {
      firstname: "A",
      surname: "B",
      phone: "123",
      email: "a@b.com",
      address: " 1 Main ,  Apt 2,City ",
      ...overrides.contact,
    },
    ...overrides,
  };
}

function baseProps(overrides: Partial<any> = {}) {
  return {
    isBusy: false,
    nextRecipient: makeRecipient(),
    questionContact: makeRecipient(),
    activeCall: null,
    recentCall: null,
    hangUp: vi.fn(),
    handleVoiceDrop: vi.fn(),
    handleDialNext: vi.fn(),
    handleDequeueNext: vi.fn(),
    disposition: "idle",
    dispositionOptions: [],
    setDisposition: vi.fn(),
    recentAttempt: null,
    predictive: false,
    conference: null,
    voiceDrop: false,
    displayState: "idle",
    callState: "idle",
    callDuration: 0,
    ...overrides,
  };
}

describe("app/components/call/CallScreen.CallArea.tsx", () => {
  test("uses default predictive/conference/voiceDrop values when omitted", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    render(
      <CallArea
        {...(baseProps({
          // predictive / conference / voiceDrop intentionally omitted
          predictive: undefined,
          conference: undefined,
          voiceDrop: undefined,
        }) as any)}
      />,
    );

    expect(screen.getByRole("button", { name: "Dial" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Audio Drop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start Dialing" })).toBeNull();
  });

  test("renders all displayState labels (and default Pending) with formatted duration", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const base = baseProps({ nextRecipient: null, callDuration: 61 });

    const cases: Array<{ displayState: string; expected: string }> = [
      { displayState: "failed", expected: "Call Failed" },
      { displayState: "dialing", expected: "Dialing... t61" },
      { displayState: "connected", expected: "Connected t61" },
      { displayState: "no-answer", expected: "No Answer" },
      { displayState: "voicemail", expected: "Voicemail Left" },
      { displayState: "completed", expected: "Call Completed" },
      { displayState: "idle", expected: "Pending" },
      { displayState: "", expected: "Pending" },
    ];

    for (const c of cases) {
      const { unmount } = render(<CallArea {...base} displayState={c.displayState} />);
      expect(screen.getByText(c.expected)).toBeInTheDocument();
      unmount();
    }
  });

  test("predictive idle shows a single Start Dialing action when no conference, Start with one", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const handleDialNext = vi.fn();
    const { rerender } = render(
      <CallArea
        {...baseProps({
          nextRecipient: null,
          handleDialNext,
          predictive: true,
        })}
      />,
    );

    // Single state-driven action: the dial button IS "Start Dialing".
    const startDialing = screen.getByTestId("call-screen-dial");
    expect(startDialing).toHaveTextContent("Start Dialing");
    fireEvent.click(startDialing);
    expect(handleDialNext).toHaveBeenCalledTimes(1);

    rerender(
      <CallArea
        {...baseProps({
          nextRecipient: null,
          handleDialNext,
          predictive: true,
          conference: { parameters: { Sid: "conf-1" } },
        })}
      />,
    );

    const start = screen.getByTestId("call-screen-dial");
    expect(start).toHaveTextContent("Start");
    fireEvent.click(start);
    expect(handleDialNext).toHaveBeenCalledTimes(2);
  });

  test("renders recipient info including trimmed address segments", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    render(<CallArea {...baseProps()} />);

    expect(screen.getByText("A B")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByText("1 Main, Apt 2, City")).toBeInTheDocument();
  });

  test("in-call state shows Hang Up / Audio Drop / mute; idle shows neither", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const hangUp = vi.fn();
    const handleVoiceDrop = vi.fn();
    const onToggleMute = vi.fn();

    const { rerender } = render(
      <CallArea
        {...baseProps({
          hangUp,
          handleVoiceDrop,
          onToggleMute,
          voiceDrop: true,
        })}
      />,
    );

    // Idle: call-only actions are hidden entirely.
    expect(screen.queryByRole("button", { name: "Hang Up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Audio Drop" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Mute microphone" }),
    ).toBeNull();

    rerender(
      <CallArea
        {...baseProps({
          hangUp,
          handleVoiceDrop,
          onToggleMute,
          voiceDrop: true,
          displayState: "connected",
          callState: "connected",
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hang Up" }));
    fireEvent.click(screen.getByRole("button", { name: "Click again to hang up" }));
    fireEvent.click(screen.getByRole("button", { name: "Audio Drop" }));
    expect(hangUp).toHaveBeenCalledTimes(1);
    expect(handleVoiceDrop).toHaveBeenCalledTimes(1);

    const mute = screen.getByRole("button", { name: "Mute microphone" });
    expect(mute).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(mute);
    expect(onToggleMute).toHaveBeenCalledTimes(1);

    rerender(
      <CallArea
        {...baseProps({
          hangUp,
          handleVoiceDrop,
          onToggleMute,
          isMicrophoneMuted: true,
          voiceDrop: true,
          displayState: "connected",
          callState: "connected",
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Unmute microphone" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("power dial with empty queue shows a Load Queue primary action that calls onLoadQueue", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const onLoadQueue = vi.fn();
    render(
      <CallArea
        {...baseProps({ nextRecipient: null, onLoadQueue })}
      />,
    );

    expect(screen.queryByTestId("call-screen-dial")).toBeNull();
    const loadQueue = screen.getByTestId("call-screen-load-queue");
    expect(loadQueue).toHaveTextContent("Load Queue");
    fireEvent.click(loadQueue);
    expect(onLoadQueue).toHaveBeenCalledTimes(1);
  });

  test("dial button requires a confirmation click after a call ends in manual mode (#1292)", async () => {
    // Scenario: the recipient hangs up first, so the button flips from
    // Hang Up to Dial under an agent's still-in-flight click. Without the
    // guard, that click would immediately dial the next contact. The guard
    // consumes the first click as a "wake up" and only dials on the second.
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");
    const handleDialNext = vi.fn();

    // Start in an in-call state so `showInCall` is true.
    const { rerender } = render(
      <CallArea
        {...baseProps({
          callState: "connected",
          displayState: "connected",
          handleDialNext,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Hang Up" })).toBeInTheDocument();

    // Recipient hangs up: callState transitions to completed. The Dial
    // button appears, but armed — its label is the confirm prompt.
    rerender(
      <CallArea
        {...baseProps({
          callState: "idle",
          displayState: "completed",
          handleDialNext,
        })}
      />,
    );
    // Label reads "Click again to call back" while armed — Sai's #1342
    // point 1: the button that just replaced Hang Up should evoke
    // "back to calling" so the agent knows why the label changed.
    const armed = screen.getByRole("button", { name: "Click again to call back" });
    expect(armed).toBeInTheDocument();

    // The armed click MUST NOT dial.
    fireEvent.click(armed);
    expect(handleDialNext).not.toHaveBeenCalled();

    // After disarming, the button flips back to the normal Dial label and
    // clicking it dials for real.
    const dial = screen.getByRole("button", { name: "Dial" });
    fireEvent.click(dial);
    expect(handleDialNext).toHaveBeenCalledTimes(1);
  });

  test("dial button does NOT require confirmation when arriving from idle (no prior call to confuse the click)", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");
    const handleDialNext = vi.fn();

    render(
      <CallArea
        {...baseProps({
          callState: "idle",
          displayState: "idle",
          handleDialNext,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dial" }));
    expect(handleDialNext).toHaveBeenCalledTimes(1);
  });

  test("predictive Start Dialing does NOT require confirmation after a call ends (only replacing-the-hangup manual dial does)", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");
    const handleDialNext = vi.fn();

    const { rerender } = render(
      <CallArea
        {...baseProps({
          predictive: true,
          conference: { parameters: { Sid: "CF1" } },
          callState: "connected",
          displayState: "connected",
          handleDialNext,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Hang Up" })).toBeInTheDocument();

    rerender(
      <CallArea
        {...baseProps({
          predictive: true,
          // conference cleared → back to Start Dialing
          conference: null,
          callState: "idle",
          displayState: "completed",
          handleDialNext,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Dialing" }));
    expect(handleDialNext).toHaveBeenCalledTimes(1);
  });

  test("dial button is the idle primary action; hidden while dialing/connected", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const { rerender } = render(<CallArea {...baseProps()} />);

    const dial = screen.getByRole("button", { name: "Dial" });
    expect(dial).not.toBeDisabled();
    expect(dial.getAttribute("title")).toBe("Dial 123");

    rerender(<CallArea {...baseProps({ isBusy: true })} />);
    expect(screen.getByRole("button", { name: "Dial" })).toBeDisabled();

    rerender(
      <CallArea
        {...baseProps({ displayState: "dialing", callState: "dialing" })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Dial" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Hang Up" }),
    ).toBeInTheDocument();
  });

  test("disposition select and Save and Next cover option shapes, disable rules, and dequeue handler", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const setDisposition = vi.fn();
    const handleDequeueNext = vi.fn();

    const dispositionOptions: any[] = [
      { value: "a", label: "A" },
      "b",
    ];

    const { rerender } = render(
      <CallArea
        {...baseProps({
          questionContact: null,
          handleDequeueNext,
          dispositionOptions,
          setDisposition,
        })}
      />,
    );

    const sel = screen.getByRole("combobox") as HTMLSelectElement;
    expect(sel).toBeDisabled();

    const saveNext = screen.getByRole("button", { name: "Save and Next" });
    expect(saveNext).toBeDisabled();

    rerender(
      <CallArea
        {...baseProps({
          handleDequeueNext,
          disposition: "a",
          dispositionOptions,
          setDisposition,
        })}
      />,
    );

    const sel2 = screen.getByRole("combobox") as HTMLSelectElement;
    expect(sel2).not.toBeDisabled();
    fireEvent.change(sel2, { target: { value: "b" } });
    expect(setDisposition).toHaveBeenCalledWith("b");

    const saveNext2 = screen.getByRole("button", { name: "Save and Next" });
    expect(saveNext2).not.toBeDisabled();
    fireEvent.click(saveNext2);
    expect(handleDequeueNext).toHaveBeenCalledTimes(1);

    rerender(
      <CallArea
        {...baseProps({
          handleDequeueNext,
          disposition: "completed",
          dispositionOptions,
          setDisposition,
          displayState: "completed",
          callState: "completed",
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Save and Next" })).toBeDisabled();
  });

  // Regression for #1253: "survey/script and disposition are all inactive
  // and can't be filled after hanging up with user". hangup.action.server.ts
  // dequeues the just-finished contact's queue row the instant the agent
  // hangs up, which the call screen's queue state (useQueue's updateQueue)
  // reflects by collapsing `nextRecipient` — to the following queue item, or
  // to null once the queue empties (the reported case: a single-contact
  // queue). The disposition Select must stay driven by `questionContact`
  // (who the panel is currently recording an outcome for), which survives
  // that collapse, not by the queue's `nextRecipient` pointer.
  test("#1253: disposition select stays enabled after the queue empties post-hangup (nextRecipient null, questionContact still set)", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const setDisposition = vi.fn();
    const handleDequeueNext = vi.fn();
    const dispositionOptions: any[] = [{ value: "completed", label: "Completed" }];

    render(
      <CallArea
        {...baseProps({
          // The exact post-hangup shape: the queue's forward pointer is
          // gone, but the contact just called is still the one the agent
          // needs to record a disposition for.
          nextRecipient: null,
          questionContact: makeRecipient(),
          handleDequeueNext,
          dispositionOptions,
          setDisposition,
        })}
      />,
    );

    const sel = screen.getByRole("combobox") as HTMLSelectElement;
    expect(sel).not.toBeDisabled();

    fireEvent.change(sel, { target: { value: "completed" } });
    expect(setDisposition).toHaveBeenCalledWith("completed");
  });
});
