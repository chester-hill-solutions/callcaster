import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CallScreenLayoutProps } from "@/hooks/call/useCallScreen";
import { handleConference } from "@/lib/callscreenActions";
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

function setup(dialType: "predictive" | "call" = "predictive") {
  const controls = {
    hangUp: vi.fn(),
    setConference: vi.fn(),
    handleConferenceEnd: handleConference({ begin: vi.fn() }).handleConferenceEnd,
    activeCall: null,
    conference: "agent~campaign",
    disposition: "",
    availableCredits: 100,
    creditState: "GOOD",
  };
  const device = { destroy: vi.fn() };
  const requeueContacts = vi.fn();
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
  render(<MemoryRouter><CallScreenLayout {...props} /></MemoryRouter>);
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
    expect(controls.device.destroy).toHaveBeenCalledTimes(1);
    expect(controls.hangUp).toHaveBeenCalledTimes(1);
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

  test("live Leave retains local hangup, device teardown and queue reset", async () => {
    const controls = setup("call");
    fireEvent.click(confirmLeave());
    await waitFor(() => expect(controls.navigate).toHaveBeenCalledWith(-1));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(controls.hangUp).toHaveBeenCalledTimes(1);
    expect(controls.device.destroy).toHaveBeenCalledTimes(1);
    expect(controls.requeueContacts).toHaveBeenCalledTimes(1);
  });

  test("the welcome Leave callback requests confirmation before predictive cleanup", () => {
    const controls = setup();
    fireEvent.click(screen.getByRole("button", { name: "Welcome Leave" }));
    expect(screen.getByRole("dialog", { name: "Leave campaign?" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(controls.hangUp).not.toHaveBeenCalled();
  });
});
