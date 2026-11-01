import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { toast } from "sonner";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";
import { CallArea, CallControls } from "@/components/call/CallScreen.CallArea";
import { Toaster } from "@/components/ui/sonner";

let begin: () => Promise<void>;
const showError = vi.fn((message: string) => { toast.error(message); });
const hangUp = vi.fn();
function Fixture({ callerId = "+15550000001", selectedDevice = "computer", connected = false }: {
  callerId?: string;
  selectedDevice?: string;
  connected?: boolean;
}) {
  const start = useStartConferenceAndDial({
    currentVerified: true, userId: "u1", workspaceId: "10000000-0000-4000-8000-000000000001", campaignId: "42", callerId, selectedDevice, showError,
  });
  begin = start.begin;
  return <>
    <CallControls
      isBusy={false} nextRecipient={null} hangUp={() => { hangUp(); void start.stop(); }}
      handleVoiceDrop={() => {}} handleDialNext={start.begin}
      hasDialerSession={start.hasSession}
      predictive conference={connected || start.conference ? { parameters: { Sid: start.conference ?? "existing" } } : null}
      voiceDrop={false} callState={connected ? "connected" : "idle"}
      isStartingConference={start.isLoading} startDisabledReason={start.disabledReason}
    />
    <output aria-label="Conference">{start.conference}</output>
    <Toaster />
  </>;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(async () => {
  cleanup();
  await act(async () => {});
  toast.dismiss();
  vi.unstubAllGlobals();
});

describe("predictive start feedback", () => {
  test.each([
    { callerId: "", selectedDevice: "computer", reason: "Set caller ID in Setup" },
    { callerId: "+15550000001", selectedDevice: "", reason: "Select a device" },
  ])("missing prerequisite: $reason blocks both the control and direct start", async ({ callerId, selectedDevice, reason }) => {
    render(<Fixture callerId={callerId} selectedDevice={selectedDevice} />);
    const dial = screen.getByRole("button", { name: reason });
    expect(dial).toBeDisabled();
    fireEvent.click(dial);
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { await begin(); });
    expect(fetch).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(reason, false);
  });

  test("a configured start stays pending until acknowledgement and refuses a second request", async () => {
    let respond!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>((resolve) => { respond = resolve; }));
    render(<Fixture />);
    expect(screen.getByRole("button", { name: "Start Dialing" })).toBeEnabled();
    let first!: Promise<void>;
    act(() => { first = begin(); void begin(); });
    const pending = screen.getByRole("button", { name: "Stop Dialing" });
    expect(pending).toBeEnabled();
    await act(async () => { await begin(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      respond(Response.json({ success: true, conferenceName: "u1~42" }));
      await first;
    });
    expect(screen.getByLabelText("Conference")).toHaveTextContent("u1~42");
    expect(screen.getByRole("button", { name: "Stop Dialing" })).toBeEnabled();
    expect(showError).not.toHaveBeenCalled();
  });

  test("Stop stays available during an unanswered Start and its late reply cannot restore the room", async () => {
    let reply!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (String(url) !== "/api/auto-dial/end") return new Promise<Response>(resolve => { reply = resolve; });
      const value = JSON.parse(String(init?.body));
      return Promise.resolve(Response.json({ success: true, workspace_id: value.workspaceId, user_id: "u1", campaign_id: 42,
        intent_id: value.dial_intent_id, conference_id: null, stop_state: "stopped" }));
    });
    render(<Fixture />); fireEvent.click(screen.getByRole("button", { name: "Start Dialing" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop Dialing" }));
    fireEvent.click(screen.getByRole("button", { name: "Click again to hang up" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start Dialing" })).toBeEnabled());
    const start = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const stop = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(stop.dial_intent_id).toBe(start.dial_intent_id);
    await act(async () => { reply(Response.json({ success: true, conferenceName: "retired-room" })); });
    expect(screen.getByLabelText("Conference")).toBeEmptyDOMElement();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("a room-ended event retains a visible Stop action until the captured session is acknowledged", async () => {
    let ended!: () => void;
    function RoomFixture() {
      const start = useStartConferenceAndDial({ currentVerified: true, userId: "u1", workspaceId: "10000000-0000-4000-8000-000000000001",
        campaignId: "42", callerId: "+16135550101", selectedDevice: "computer" });
      ended = () => start.setConference(null);
      return <CallArea isBusy={false} nextRecipient={null} questionContact={null} activeCall={null} recentCall={null} recentAttempt={null}
        displayState="idle" callDuration={0} disposition="" dispositionOptions={[]} setDisposition={() => {}} handleDequeueNext={() => {}}
        hangUp={() => { void start.stop(); }} handleVoiceDrop={() => {}}
        handleDialNext={start.begin} predictive conference={start.conference ? { parameters: { Sid: start.conference } } : null}
        hasDialerSession={start.hasSession} voiceDrop={false} callState="idle" />;
    }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: true, conferenceName: "owned-room" }));
    render(<RoomFixture />); fireEvent.click(screen.getByRole("button", { name: "Start Dialing" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop Dialing" })).toBeEnabled());
    act(() => ended()); expect(screen.getByRole("button", { name: "Stop Dialing" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Start Dialing" })).not.toBeInTheDocument();
  });

  test("a route failure shows once in the actual root toaster and remains retryable through revalidation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "Campaign is paused." }, { status: 400 }));
    const view = render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "Start Dialing" }));
    await waitFor(() => expect(screen.getByText("Campaign is paused.")).toBeInTheDocument());
    expect(showError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Start Dialing" })).toBeEnabled();
    view.rerender(<Fixture />);
    expect(showError).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: true, conferenceName: "retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Dialing" }));
    await waitFor(() => expect(screen.getByLabelText("Conference")).toHaveTextContent("retry"));
    expect(fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const retryBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(firstBody.dial_intent_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(retryBody.dial_intent_id).toBe(firstBody.dial_intent_id);
    expect(showError).toHaveBeenCalledTimes(1);
  });

  test("402 is reported once and its pending lock clears for credit recovery", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ creditsError: true }, { status: 402 }));
    render(<Fixture />);
    await act(async () => { await begin(); });
    expect(showError).toHaveBeenCalledExactlyOnceWith("Insufficient credits to start dialing", true);
    expect(screen.getByRole("button", { name: "Start Dialing" })).toBeEnabled();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: true, conferenceName: "funded" }));
    await act(async () => { await begin(); });
    expect(screen.getByLabelText("Conference")).toHaveTextContent("funded");
    expect(showError).toHaveBeenCalledTimes(1);
  });

  test("start prerequisites do not disable an existing connected call's hang-up control", () => {
    render(<Fixture connected callerId="" selectedDevice="" />);
    const hangup = screen.getByRole("button", { name: "Stop Dialing" });
    expect(hangup).toBeEnabled();
    fireEvent.click(hangup);
    fireEvent.click(screen.getByRole("button", { name: /Click again to hang up/i }));
    expect(hangUp).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
