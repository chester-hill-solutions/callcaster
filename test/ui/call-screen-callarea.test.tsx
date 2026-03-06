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
  formatTime: (seconds: number) => `t${seconds}`,
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

describe("app/components/call/CallScreen.CallArea.tsx", () => {
  test("uses default predictive/conference/voiceDrop values when omitted", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    render(
      <CallArea
        {...({
          isBusy: false,
          nextRecipient: makeRecipient(),
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
          // predictive / conference / voiceDrop intentionally omitted
          displayState: "idle",
          callState: "idle",
          callDuration: 0,
        } as any)}
      />,
    );

    expect(screen.getByRole("button", { name: "Dial" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Audio Drop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start Dialing" })).toBeNull();
  });

  test("renders all displayState labels (and default Pending) with formatted duration", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const base = {
      isBusy: false,
      nextRecipient: null,
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
      callDuration: 61,
    };

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

  test("predictive idle shows Start Dialing when no conference; dial button uses Start label", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const handleDialNext = vi.fn();
    render(
      <CallArea
        isBusy={false}
        nextRecipient={null}
        activeCall={null}
        recentCall={null}
        hangUp={vi.fn()}
        handleVoiceDrop={vi.fn()}
        handleDialNext={handleDialNext}
        handleDequeueNext={vi.fn()}
        disposition="idle"
        dispositionOptions={[]}
        setDisposition={vi.fn()}
        recentAttempt={null}
        predictive={true}
        conference={null}
        voiceDrop={false}
        displayState="idle"
        callState="idle"
        callDuration={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Dialing" }));
    expect(handleDialNext).toHaveBeenCalledTimes(1);

    // predictive -> main dial button shows "Start"
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });

  test("renders recipient info including trimmed address segments", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    render(
      <CallArea
        isBusy={false}
        nextRecipient={makeRecipient()}
        activeCall={null}
        recentCall={null}
        hangUp={vi.fn()}
        handleVoiceDrop={vi.fn()}
        handleDialNext={vi.fn()}
        handleDequeueNext={vi.fn()}
        disposition="idle"
        dispositionOptions={[]}
        setDisposition={vi.fn()}
        recentAttempt={null}
        predictive={false}
        conference={null}
        voiceDrop={false}
        displayState="idle"
        callState="idle"
        callDuration={0}
      />,
    );

    expect(screen.getByText("A B")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByText("1 Main, Apt 2, City")).toBeInTheDocument();
  });

  test("hang up and audio drop buttons enable/disable by callState", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const hangUp = vi.fn();
    const handleVoiceDrop = vi.fn();

    const { rerender } = render(
      <CallArea
        isBusy={false}
        nextRecipient={makeRecipient()}
        activeCall={null}
        recentCall={null}
        hangUp={hangUp}
        handleVoiceDrop={handleVoiceDrop}
        handleDialNext={vi.fn()}
        handleDequeueNext={vi.fn()}
        disposition="idle"
        dispositionOptions={[]}
        setDisposition={vi.fn()}
        recentAttempt={null}
        predictive={false}
        conference={null}
        voiceDrop={true}
        displayState="idle"
        callState="idle"
        callDuration={0}
      />,
    );

    expect(screen.getByRole("button", { name: "Hang Up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Audio Drop" })).toBeDisabled();

    rerender(
      <CallArea
        isBusy={false}
        nextRecipient={makeRecipient()}
        activeCall={null}
        recentCall={null}
        hangUp={hangUp}
        handleVoiceDrop={handleVoiceDrop}
        handleDialNext={vi.fn()}
        handleDequeueNext={vi.fn()}
        disposition="idle"
        dispositionOptions={[]}
        setDisposition={vi.fn()}
        recentAttempt={null}
        predictive={false}
        conference={null}
        voiceDrop={true}
        displayState="connected"
        callState="connected"
        callDuration={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hang Up" }));
    fireEvent.click(screen.getByRole("button", { name: "Audio Drop" }));
    expect(hangUp).toHaveBeenCalledTimes(1);
    expect(handleVoiceDrop).toHaveBeenCalledTimes(1);
  });

  test("dial button disables for busy/dialing/connected and for non-predictive with no recipient; title branches", async () => {
    const { CallArea } = await import("@/components/call/CallScreen.CallArea");

    const { rerender } = render(
      <CallArea
        isBusy={false}
        nextRecipient={null}
        activeCall={null}
        recentCall={null}
        hangUp={vi.fn()}
        handleVoiceDrop={vi.fn()}
        handleDialNext={vi.fn()}
        handleDequeueNext={vi.fn()}
        disposition="idle"
        dispositionOptions={[]}
        setDisposition={vi.fn()}
        recentAttempt={null}
        predictive={false}
        conference={null}
        voiceDrop={false}
        displayState="idle"
        callState="idle"
        callDuration={0}
      />,
    );

    const dial = screen.getByRole("button", { name: "Dial" });
    expect(dial).toBeDisabled();
    expect(dial.getAttribute("title")).toBe("Load your queue to get started");

    rerender(
      <CallArea
        isBusy={false}
        nextRecipient={makeRecipient()}
        activeCall={null}
        recentCall={null}
        hangUp={vi.fn()}
        handleVoiceDrop={vi.fn()}
        handleDialNext={vi.fn()}
        handleDequeueNext={vi.fn()}
        disposition="idle"
        dispositionOptions={[]}
        setDisposition={vi.fn()}
        recentAttempt={null}
        predictive={false}
        conference={null}
        voiceDrop={false}
        displayState="idle"
        callState="idle"
        callDuration={0}
      />,
    );

    const dial2 = screen.getByRole("button", { name: "Dial" });
    expect(dial2).not.toBeDisabled();
    expect(dial2.getAttribute("title")).toBe("Dial 123");

    rerender(
      <CallArea
        isBusy={true}
        nextRecipient={makeRecipient()}
        activeCall={null}
        recentCall={null}
        hangUp={vi.fn()}
        handleVoiceDrop={vi.fn()}
        handleDialNext={vi.fn()}
        handleDequeueNext={vi.fn()}
        disposition="idle"
        dispositionOptions={[]}
        setDisposition={vi.fn()}
        recentAttempt={null}
        predictive={false}
        conference={null}
        voiceDrop={false}
        displayState="dialing"
        callState="dialing"
        callDuration={0}
      />,
    );
    expect(screen.getByRole("button", { name: "Dial" })).toBeDisabled();
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
        isBusy={false}
        nextRecipient={null}
        activeCall={null}
        recentCall={null}
        hangUp={vi.fn()}
        handleVoiceDrop={vi.fn()}
        handleDialNext={vi.fn()}
        handleDequeueNext={handleDequeueNext}
        disposition="idle"
        dispositionOptions={dispositionOptions as any}
        setDisposition={setDisposition}
        recentAttempt={null}
        predictive={false}
        conference={null}
        voiceDrop={false}
        displayState="idle"
        callState="idle"
        callDuration={0}
      />,
    );

    const sel = screen.getByRole("combobox") as HTMLSelectElement;
    expect(sel).toBeDisabled();

    const saveNext = screen.getByRole("button", { name: "Save and Next" });
    expect(saveNext).toBeDisabled();

    rerender(
      <CallArea
        isBusy={false}
        nextRecipient={makeRecipient()}
        activeCall={null}
        recentCall={null}
        hangUp={vi.fn()}
        handleVoiceDrop={vi.fn()}
        handleDialNext={vi.fn()}
        handleDequeueNext={handleDequeueNext}
        disposition="a"
        dispositionOptions={dispositionOptions as any}
        setDisposition={setDisposition}
        recentAttempt={null}
        predictive={false}
        conference={null}
        voiceDrop={false}
        displayState="idle"
        callState="idle"
        callDuration={0}
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
  });
});

