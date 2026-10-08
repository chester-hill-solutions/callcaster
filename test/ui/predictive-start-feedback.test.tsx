import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { toast } from "sonner";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";
import { CallControls } from "@/components/call/CallScreen.CallArea";
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
    userId: "u1", workspaceId: "ws", campaignId: "42", callerId, selectedDevice, showError,
  });
  begin = start.begin;
  return <>
    <CallControls
      isBusy={false} nextRecipient={null} hangUp={hangUp}
      handleVoiceDrop={() => {}} handleDialNext={start.begin}
      predictive conference={connected ? { parameters: { Sid: "existing" } } : null}
      voiceDrop={false} callState={connected ? "connected" : "idle"}
      isStartingConference={start.isLoading} startDisabledReason={start.disabledReason}
    />
    <output aria-label="Conference">{start.conference}</output>
    <Toaster />
  </>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
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
    const pending = screen.getByRole("button", { name: "Starting…" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("data-pending", "true");
    fireEvent.click(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      respond(Response.json({ success: true, conferenceName: "u1~42" }));
      await first;
    });
    expect(screen.getByLabelText("Conference")).toHaveTextContent("u1~42");
    expect(screen.getByRole("button", { name: "Start Dialing" })).toBeEnabled();
    expect(showError).not.toHaveBeenCalled();
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
    const hangup = screen.getByRole("button", { name: "Hang Up" });
    expect(hangup).toBeEnabled();
    fireEvent.click(hangup);
    fireEvent.click(screen.getByRole("button", { name: /Click again to hang up/i }));
    expect(hangUp).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
