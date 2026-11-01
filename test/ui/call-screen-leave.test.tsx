import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CallScreenLayoutProps } from "@/hooks/call/useCallScreen";
import { handleConference, releaseCallSession } from "@/lib/callscreenActions";
import { CallScreenLayout } from "@/components/call/CallScreen.Layout";

const mocks = vi.hoisted(() => ({ showError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.showError } }));
vi.mock("@/components/call/CallScreen.QueueList", () => ({ QueueList: () => null }));
vi.mock("@/components/call/CallScreen.CallArea", () => ({ CallArea: () => null }));
vi.mock("@/components/call/CallScreen.Questionnaire", () => ({ CallQuestionnaire: () => null }));
vi.mock("@/components/call/CallScreen.Household", () => ({ Household: () => null }));
vi.mock("@/components/call/CallScreen.DTMFPhone", () => ({ PhoneKeypad: () => null }));
vi.mock("@/components/call/CallScreen.LiveCoachingPanels", () => ({ CallScreenLiveCoachingPanels: () => null }));
vi.mock("@/components/call/CallScreen.Dialogs", () => ({
  CampaignDialogs: ({ onLeaveCampaign }: { onLeaveCampaign: () => void }) => (
    <button onClick={onLeaveCampaign}>Welcome Leave</button>
  ),
}));

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(
  dialType: "predictive" | "call" = "predictive",
  activeCall: unknown = null,
  renderScreen: (props: CallScreenLayoutProps) => void = (props) => {
    render(<MemoryRouter><CallScreenLayout {...props} /></MemoryRouter>);
  },
) {
  const controls = {
    hangUp: vi.fn(),
    setConference: vi.fn(),
    handleConferenceEnd: handleConference({ begin: vi.fn() }).handleConferenceEnd,
    activeCall,
    conference: "agent~campaign",
    disposition: "",
    availableCredits: 100,
    creditState: "GOOD",
  };
  const device = { destroy: vi.fn() };
  const requeueContacts = vi.fn(() => releaseCallSession(1));
  const navigate = vi.fn();
  const props = {
    campaign: { id: 1, title: "Campaign", dial_type: dialType },
    campaignDetails: { disposition_options: [], script_id: 1, script: {} },
    credits: 100,
    count: 1,
    completed: 0,
    workspaceId: "workspace-1",
    hasAccess: true,
    verifiedNumbers: [],
    device,
    navigate,
    callControls: controls,
    queueControls: { queue: [], predictiveQueue: [], householdMap: {}, requeueContacts },
    formState: {},
    dialogControls: {},
    audioControls: {},
    phoneVerification: {},
  } as unknown as CallScreenLayoutProps;
  renderScreen(props);
  return { ...controls, device, navigate, requeueContacts };
}

function confirmLeave() {
  fireEvent.click(screen.getByRole("button", { name: "Leave Campaign" }));
  return within(screen.getByRole("dialog", { name: "Leave campaign?" }))
    .getByRole("button", { name: "Leave Campaign" });
}

describe("Leave Campaign", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    mocks.showError.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  test("identifies a predictive campaign as Predictive dialing", () => {
    setup("predictive");
    expect(screen.getByText("Predictive dialing")).toBeInTheDocument();
  });

  test("identifies a power campaign as Power dialing", () => {
    setup("call");
    expect(screen.getByText("Power dialing")).toBeInTheDocument();
  });

  test("waits for predictive conference completion before teardown and never resets the queue", async () => {
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    const controls = setup();
    const confirm = confirmLeave();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/conference and predictive dialer will stop/i)).toBeInTheDocument();
    fireEvent.click(confirm);
    expect(fetchMock).toHaveBeenCalledWith("/api/auto-dial/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "workspace-1", conferenceName: "agent~campaign" }),
    });
    expect(confirm).toBeDisabled();
    expect(controls.navigate).not.toHaveBeenCalled();
    expect(controls.device.destroy).not.toHaveBeenCalled();
    expect(controls.hangUp).not.toHaveBeenCalled();
    expect(controls.requeueContacts).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(Response.json({ success: true })));
    await waitFor(() => expect(controls.navigate).toHaveBeenCalledWith(-1));
    expect(controls.setConference).toHaveBeenCalledWith(null);
    expect(controls.device.destroy).not.toHaveBeenCalled();
    expect(controls.hangUp).not.toHaveBeenCalled();
    expect(controls.requeueContacts).not.toHaveBeenCalled();
  });

  test.each(["http", "network", "invalid-success"] as const)("keeps the device and screen available after %s failure, then permits retry", async (failure) => {
    if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("offline"));
    else fetchMock.mockResolvedValueOnce(failure === "http"
      ? Response.json({ error: "Could not stop" }, { status: 502 })
      : Response.json({ error: "still running" }));
    fetchMock.mockResolvedValueOnce(Response.json({ success: true }));
    const controls = setup();
    const confirm = confirmLeave();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.showError).toHaveBeenCalled());
    expect(confirm).toBeEnabled();
    expect(controls.navigate).not.toHaveBeenCalled();
    expect(controls.device.destroy).not.toHaveBeenCalled();
    expect(controls.hangUp).not.toHaveBeenCalled();
    expect(controls.setConference).not.toHaveBeenCalled();
    expect(controls.requeueContacts).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(controls.navigate).toHaveBeenCalledWith(-1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("Cancel preserves predictive calls, device and queue", () => {
    const controls = setup();
    confirmLeave();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(controls.navigate).not.toHaveBeenCalled();
    expect(controls.hangUp).not.toHaveBeenCalled();
    expect(controls.device.destroy).not.toHaveBeenCalled();
    expect(controls.requeueContacts).not.toHaveBeenCalled();
  });

  test("live Leave waits for hangup before navigation and leaves device teardown to its hook", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ released: 1 }));
    const controls = setup("call", {});
    let finishHangUp!: () => void;
    controls.hangUp.mockImplementation(
      () => new Promise<void>((resolve) => { finishHangUp = resolve; }),
    );
    fireEvent.click(confirmLeave());

    expect(controls.hangUp).toHaveBeenCalledTimes(1);
    expect(controls.navigate).not.toHaveBeenCalled();
    expect(controls.requeueContacts).not.toHaveBeenCalled();
    expect(controls.device.destroy).not.toHaveBeenCalled();

    await act(async () => finishHangUp());
    await waitFor(() => expect(controls.navigate).toHaveBeenCalledWith(-1));
    expect(fetchMock).toHaveBeenCalledWith("/api/campaigns/1/call-session/release", { method: "POST" });
    expect(controls.hangUp).toHaveBeenCalledTimes(1);
    expect(controls.device.destroy).not.toHaveBeenCalled();
    expect(controls.requeueContacts).toHaveBeenCalledTimes(1);
  });

  test("power-dial Leave waits for release and suppresses duplicate confirmation", async () => {
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    const controls = setup("call");
    const confirm = confirmLeave();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    expect(controls.navigate).not.toHaveBeenCalled();
    await act(async () => pending.resolve(Response.json({ released: 0 })));
    await waitFor(() => expect(controls.navigate).toHaveBeenCalledWith(-1));
  });

  test("power-dial Leave stays disabled until real back navigation finishes", async () => {
    fetchMock.mockImplementation(async () => Response.json({ released: 1 }));
    let finishNavigation!: () => void;
    const destinationReady = new Promise<void>((resolve) => { finishNavigation = resolve; });
    const destinationLoader = vi.fn(async () => { await destinationReady; return null; });
    let router!: ReturnType<typeof createMemoryRouter>;
    setup("call", null, (props) => {
      function CallRoute() {
        const navigate = useNavigate();
        return <CallScreenLayout {...props} navigate={navigate} />;
      }
      router = createMemoryRouter([
        { path: "/before", element: <p>Before campaign</p> },
        { path: "/campaign", loader: destinationLoader, element: <p>Campaign setup</p> },
        { path: "/call", Component: CallRoute },
      ], { initialEntries: ["/before", "/campaign", "/call"], initialIndex: 2 });
      render(<RouterProvider router={router} />);
    });
    try {
      const confirm = confirmLeave();
      await act(async () => { fireEvent.click(confirm); });
      await waitFor(() => expect(destinationLoader).toHaveBeenCalledTimes(1));
      expect(router.state.navigation.state).toBe("loading");
      await act(async () => { fireEvent.click(confirm); });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(confirm).toBeDisabled();
      expect(router.state.navigation.location?.pathname).toBe("/campaign");
      await act(async () => { finishNavigation(); });
      await waitFor(() => expect(screen.getByText("Campaign setup")).toBeInTheDocument());
      expect(router.state.location.pathname).toBe("/campaign");
    } finally {
      finishNavigation();
      router.dispose();
    }
  });

  test.each(["http", "network", "invalid-success"] as const)("power-dial Leave permits retry after %s release failure", async (failure) => {
    if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("offline"));
    else fetchMock.mockResolvedValueOnce(failure === "http"
      ? Response.json({ error: "Could not release" }, { status: 502 })
      : Response.json({ error: "still assigned" }));
    fetchMock.mockResolvedValueOnce(Response.json({ released: 2 }));
    const controls = setup("call");
    const confirm = confirmLeave();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith(
      "Could not release your campaign contacts. Stay on this screen and try again.",
    ));
    expect(confirm).toBeEnabled();
    expect(controls.navigate).not.toHaveBeenCalled();
    expect(controls.device.destroy).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(controls.navigate).toHaveBeenCalledWith(-1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("the welcome Leave callback requests confirmation before predictive cleanup", () => {
    const controls = setup();
    fireEvent.click(screen.getByRole("button", { name: "Welcome Leave" }));
    expect(screen.getByRole("dialog", { name: "Leave campaign?" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(controls.hangUp).not.toHaveBeenCalled();
  });
});


describe("calling session connection timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test.each(["predictive", "call"] as const)(
    "counts recipient connection, not device connection, in %s mode", (dialType) => {
      setup(dialType, null, (props) => {
        const controls = { ...props.callControls, callState: "connected" };
        const { rerender } = render(<MemoryRouter><CallScreenLayout {...props}
          callControls={{ ...controls, displayState: "dialing" }} /></MemoryRouter>);
        const session = () => screen.getByRole("timer", { name: "Calling session elapsed time" });
        const talk = () => screen.getByRole("timer", { name: "Calling session talk time" });
        act(() => { vi.advanceTimersByTime(10_000); });
        expect(session()).toHaveTextContent("Session 00:00:10");
        expect(talk()).toHaveTextContent("Talk 00:00:00");
        rerender(<MemoryRouter><CallScreenLayout {...props}
          callControls={{ ...controls, displayState: "connected" }} /></MemoryRouter>);
        act(() => { vi.advanceTimersByTime(6_000); });
        expect(talk()).toHaveTextContent("Talk 00:00:06");
        rerender(<MemoryRouter><CallScreenLayout {...props}
          callControls={{ ...controls, displayState: "completed" }} /></MemoryRouter>);
        act(() => { vi.advanceTimersByTime(9_000); });
        expect(session()).toHaveTextContent("Session 00:00:25");
        expect(talk()).toHaveTextContent("Talk 00:00:06");
      });
    },
  );
});
