import { useState } from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createMockFetcher,
  createWorkspaceRealtimeMock,
} from "./hooks-test-helpers";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@twilio/voice-sdk", async () => {
  return await import("../mocks/twilio-voice-sdk");
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return { ...actual, playTone: vi.fn() };
});

vi.mock("@/hooks/call/useCallRoom", () => ({
  default: vi.fn(() => ({
    status: "online",
    users: [],
    predictiveState: roomState,
  })),
}));

vi.mock("@/lib/services/hooks-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/hooks-api")>()),
  hangupCall: vi.fn().mockResolvedValue(undefined),
  startConferenceAndDial: vi.fn().mockResolvedValue({
    success: true,
    conferenceName: "conf-1",
  }),
}));

const fetcher = createMockFetcher({ submit: vi.fn() });
const queueFetcher = createMockFetcher({ submit: vi.fn() });
const saveFetcher = createMockFetcher({ submit: vi.fn() });
const verifyFetcher = createMockFetcher({
  load: vi.fn(),
  data: {
    success: true,
    verificationId: "verification-1",
    phoneNumber: "+15550009999",
  },
});
const revalidate = vi.fn();

const queueItem = {
  id: 1,
  contact_id: 1,
  campaign_id: 1,
  status: "queued",
  queue_state: "queued",
  attempts: 0,
  contact: { id: 1, phone: "+15551234567", address: "123 Main" },
} as any;

let dialType = "call";
let callerId = "+15550000001";
let verifiedNumbers: string[] = [];
let workspaceAccess = true;
let queueItems = [queueItem];
let roomState: { status: string; contact_id: number | null } = { status: "idle", contact_id: null };
let initialAttempt: {
  id: number;
  contact_id: number;
  campaign_id: number;
  workspace: string;
  user_id: string;
  created_at: string;
  disposition: string;
  result: Record<string, unknown>;
} | null = null;
const navigate = vi.fn();
const createOscillator = vi.fn();
let fetcherCall = 0;
const routeFetchers = [verifyFetcher, fetcher, queueFetcher, saveFetcher];

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  const { client } = createWorkspaceRealtimeMock();
  return {
    ...actual,
    useOutletContext: () => ({ client }),
    useNavigation: () => ({ state: "idle" }),
    useRevalidator: () => ({ revalidate }),
    useNavigate: () => navigate,
    useFetcher: () => {
      const [f] = useState(() => routeFetchers[fetcherCall++ % routeFetchers.length]);
      return f;
    },
    useLoaderData: () => ({
      campaign: {
        id: 1,
        dial_type: dialType,
        caller_id: callerId,
        group_household_queue: false,
      },
      attempts: initialAttempt ? [initialAttempt] : [],
      user: { id: "user-1" },
      workspaceId: "ws",
      campaignDetails: { script_id: 1 },
      credits: 100,
      contacts: [],
      queue: queueItems,
      nextRecipient: queueItem,
      initalCallsList: [],
      initialRecentCall: null,
      initialRecentAttempt: initialAttempt,
      token: "twilio-token",
      count: 0,
      completed: 0,
      isActive: true,
      hasAccess: workspaceAccess,
      verifiedNumbers,
    }),
  };
});

describe("useCallScreen", () => {
  beforeEach(() => {
    fetcherCall = 0;
    dialType = "call";
    callerId = "+15550000001";
    verifiedNumbers = [];
    workspaceAccess = true;
    queueItems = [queueItem];
    roomState = { status: "idle", contact_id: null };
    initialAttempt = null;
    vi.clearAllMocks();
    vi.stubGlobal("alert", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/call-session/release")) {
          return Promise.resolve(Response.json({ released: 0 }));
        }
        if (url.includes("/api/queues")) {
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, status: "in-progress" }), { status: 200 }),
        );
      }),
    );

    Object.assign(fetcher, { submit: vi.fn(), state: "idle", data: undefined });
    Object.assign(queueFetcher, { submit: vi.fn(), state: "idle", data: undefined });
    Object.assign(saveFetcher, { submit: vi.fn(), state: "idle", data: undefined });
    Object.assign(verifyFetcher, {
      load: vi.fn(),
      data: {
        success: true,
        verificationId: "verification-1",
        phoneNumber: "+15550009999",
      },
    });

    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "mic1", label: "Mic" },
          { kind: "audiooutput", deviceId: "spk1", label: "Spk" },
        ]),
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
      configurable: true,
    });

    class MockAudioContext {
      currentTime = 0;
      createGain() {
        return {
          connect: vi.fn().mockReturnValue({ connect: vi.fn() }),
          gain: {
            value: 0,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
          },
        };
      }
      createOscillator() {
        createOscillator();
        return {
          type: "sine",
          frequency: { value: 0 },
          connect: vi.fn().mockReturnValue({ connect: vi.fn() }),
          start: vi.fn(),
          stop: vi.fn(),
        };
      }
      createMediaStreamDestination() {
        return {
          stream: { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream,
        };
      }
      close = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("webkitAudioContext", MockAudioContext);
  });

  test.each(["computer", "+15555550100"])(
    "campaign dialing on %s creates no generated ringing, including delayed call updates",
    async (selectedDevice) => {
      const { useCallScreen } = await import("@/hooks/call/useCallScreen");
      vi.useFakeTimers();
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      verifiedNumbers = selectedDevice === "computer" ? [] : [selectedDevice];
      const { result, unmount } = renderHook(() => useCallScreen());
      try {
        act(() => result.current.phoneVerification.setSelectedDevice(selectedDevice));
        expect(result.current.phoneVerification.selectedDevice).toBe(selectedDevice);
        act(() => result.current.callControls.handleDialButton());
        expect(result.current.callControls.displayState).toBe("dialing");
        expect(fetcher.submit).toHaveBeenCalledWith(
          expect.any(FormData),
          { action: "/api/dial", method: "POST" },
        );
        expect(createOscillator).not.toHaveBeenCalled();
        await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
        expect(result.current.callControls.displayState).toBe("dialing");
        expect(createOscillator).not.toHaveBeenCalled();

        // The speaker test proves this fixture still detects generated audio.
        await act(async () => { await result.current.audioControls.audioTest.onTestSpeaker(); });
        expect(createOscillator).toHaveBeenCalledOnce();
        expect(result.current.audioControls.audioTest.isSpeakerPlaying).toBe(true);
        expect(result.current.audioControls.audioTest.audioTestError).toBeNull();
      } finally {
        unmount();
        pause.mockRestore();
        play.mockRestore();
        vi.useRealTimers();
      }
    },
  );

  test("exposes call screen handlers and runs key flows", async () => {
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const { result } = renderHook(() => useCallScreen());

    expect(result.current.workspaceId).toBe("ws");
    expect(result.current.callControls.creditState).toBe("GOOD");

    act(() => result.current.formState.handleResponse({ blockId: "q1", value: "yes" }));
    act(() => result.current.callControls.handleDialButton());
    act(() => result.current.callControls.handleDequeueNext());
    act(() => result.current.queueControls.handleNextNumber(false));
    await act(async () => {
      await result.current.callControls.handleConferenceEnd({
        activeCall: result.current.callControls.activeCall,
        setConference: () => result.current.callControls.setConference(false),
        workspaceId: result.current.workspaceId,
      });
    });
    await act(async () => { await result.current.queueControls.requeueContacts(); });
    expect(fetch).toHaveBeenCalledWith("/api/campaigns/1/call-session/release", { method: "POST" });
    act(() => result.current.callControls.handleVoiceDrop());
    act(() => result.current.audioControls.handleDTMF("5"));

    act(() => {
      result.current.audioControls.handleMicrophoneChange({
        target: { value: "mic1" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });
    act(() => {
      result.current.audioControls.handleSpeakerChange({
        target: { value: "spk1" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });
    act(() => result.current.audioControls.handleMuteMicrophone());

    act(() => {
      result.current.phoneVerification.setNewPhoneNumber("+15551112222");
      result.current.phoneVerification.handleVerifyNewNumber();
    });
    act(() => result.current.phoneVerification.setSelectedDevice("+15559998888"));

    window.dispatchEvent(new KeyboardEvent("keypress", { key: "3" }));
  });

  test("predictive start errors reach the shared toast once and pending state reaches the layout contract", async () => {
    dialType = "predictive";
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const api = await import("@/lib/services/hooks-api");
    const { toast } = await import("sonner");
    const { result, rerender } = renderHook(() => useCallScreen());
    await act(async () => { result.current.dialogControls.onJoin(); });
    const { mockTwilioDevice } = await import("../mocks/twilio-voice-sdk");
    await waitFor(() => expect(result.current.device).not.toBeNull());
    act(() => mockTwilioDevice.emit("registered"));
    let respond!: (value: { success: boolean; error: string }) => void;
    vi.mocked(api.startConferenceAndDial).mockReturnValueOnce(new Promise((resolve) => { respond = resolve; }));
    act(() => { result.current.callControls.handleDialButton(); });
    expect(result.current.callControls.isStartingConference).toBe(true);
    await act(async () => { respond({ success: false, error: "Campaign is paused." }); });
    expect(result.current.callControls.isStartingConference).toBe(false);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Campaign is paused.");
    rerender();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(result.current.callControls.callState).toBe("idle");
  });

  test.each([true, false])("predictive credit recovery does not add a credit-error banner, workspace access: %s", async (hasAccess) => {
    dialType = "predictive";
    workspaceAccess = hasAccess;
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const api = await import("@/lib/services/hooks-api");
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useCallScreen());
    await act(async () => { result.current.dialogControls.onJoin(); });
    const { mockTwilioDevice } = await import("../mocks/twilio-voice-sdk");
    await waitFor(() => expect(result.current.device).not.toBeNull());
    act(() => mockTwilioDevice.emit("registered"));
    vi.mocked(api.startConferenceAndDial).mockResolvedValueOnce({ success: false, creditsError: true });
    await act(async () => { result.current.callControls.handleDialButton(); });
    expect(result.current.creditsError).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(toast.error).mock.calls[0];
    if (hasAccess) {
      expect(message).toBe("Add credits to start dialing, then try again.");
      expect(options?.action).toMatchObject({ label: "Add credits" });
      act(() => (options?.action as { onClick: () => void }).onClick());
      expect(navigate).toHaveBeenCalledWith("/workspaces/ws/billing");
    } else {
      expect(message).toBe("Contact a workspace administrator to add credits, then try again.");
      expect(options?.action).toBeUndefined();
    }
  });

  test("the call-screen contract carries the missing caller-ID reason and recovers after loader refresh", async () => {
    dialType = "predictive";
    callerId = "";
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const { result, rerender } = renderHook(() => useCallScreen());
    expect(result.current.callControls.startDisabledReason).toBe("Set caller ID in Setup");
    callerId = "+15550000001";
    rerender();
    expect(result.current.callControls.startDisabledReason).toBeNull();
  });

  test("the actual layout passes missing-prerequisite and pending feedback into the shared dial control", async () => {
    dialType = "predictive";
    callerId = "";
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const { CallScreenLayout } = await import("@/components/call/CallScreen.Layout");
    const { MemoryRouter } = await import("react-router");
    const { result, rerender } = renderHook(() => useCallScreen());
    const layout = () => <MemoryRouter><CallScreenLayout {...result.current}
      dialogControls={{ ...result.current.dialogControls, isDialogOpen: false, isErrorDialogOpen: false }}
    /></MemoryRouter>;
    const view = render(layout());
    expect(screen.getByRole("button", { name: "Set caller ID in Setup" })).toBeDisabled();
    callerId = "+15550000001";
    rerender();
    view.rerender(layout());
    expect(screen.getByRole("button", { name: "Start Dialing" })).toBeEnabled();
    view.rerender(<MemoryRouter><CallScreenLayout {...result.current}
      dialogControls={{ ...result.current.dialogControls, isDialogOpen: false, isErrorDialogOpen: false }}
      callControls={{ ...result.current.callControls, isStartingConference: true }}
    /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
  });

  test("keyboard DTMF ignores keypresses from editable fields", async () => {
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const { playTone } = await import("@/lib/utils");
    renderHook(() => useCallScreen());

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keypress", { key: "3", bubbles: true }),
    );
    expect(playTone).not.toHaveBeenCalled();
    input.remove();

    document.body.dispatchEvent(
      new KeyboardEvent("keypress", { key: "3", bubbles: true }),
    );
    expect(playTone).toHaveBeenCalled();
  });

  test.each(["call", "predictive"])("a caller can edit and clear saved notes in %s mode without losing answers", async (mode) => {
    dialType = mode;
    workspaceAccess = false;
    initialAttempt = {
      id: 31, contact_id: 1, campaign_id: 1, workspace: "ws", user_id: "user-1",
      created_at: new Date().toISOString(), disposition: "answered",
      result: { q1: "yes", notes: "Call after 6 pm" },
    };
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const { CallScreenLayout } = await import("@/components/call/CallScreen.Layout");
    const { MemoryRouter } = await import("react-router");
    function CallScreen() {
      const model = useCallScreen();
      return <CallScreenLayout {...model} dialogControls={{ ...model.dialogControls, isDialogOpen: false, isErrorDialogOpen: false }} />;
    }
    render(<MemoryRouter><CallScreen /></MemoryRouter>);
    const notes = screen.getByRole("textbox", { name: "Notes", exact: true });
    expect(notes).toBeEnabled();
    expect(notes).toHaveValue("Call after 6 pm");
    fireEvent.change(notes, { target: { value: "Call after 7 pm\nAsk for Alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    expect(saveFetcher.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ contact_id: 1, campaign_id: 1, workspace: "ws", callId: 31, update: { q1: "yes", notes: "Call after 7 pm\nAsk for Alex" } }),
      { method: "PATCH", action: "/api/questions", encType: "application/json" },
    );
    fireEvent.change(notes, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    expect(saveFetcher.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: { q1: "yes", notes: "" } }),
      expect.anything(),
    );
  });

  test("a disposition save preserves loaded notes and switching contacts clears them", async () => {
    initialAttempt = {
      id: 31, contact_id: 1, campaign_id: 1, workspace: "ws", user_id: "user-1",
      created_at: new Date().toISOString(), disposition: "answered",
      result: { q1: "yes", notes: "Call after 6 pm" },
    };
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const { result } = renderHook(() => useCallScreen());
    expect(result.current.formState.update).toEqual({ q1: "yes", notes: "Call after 6 pm" });
    act(() => result.current.callControls.setDisposition("not_home"));
    act(() => result.current.formState.saveData());
    expect(saveFetcher.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ disposition: "not_home", update: { q1: "yes", notes: "Call after 6 pm" } }),
      expect.anything(),
    );
    act(() => result.current.formState.handleResponse({ blockId: "q2", value: "follow-up" }));
    act(() => result.current.formState.saveData());
    expect(saveFetcher.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: { q1: "yes", q2: "follow-up", notes: "Call after 6 pm" } }),
      expect.anything(),
    );
    const secondContact = { ...queueItem, id: 2, contact_id: 2, contact: { ...queueItem.contact, id: 2 } };
    act(() => { result.current.queueControls.switchQuestionContact({ contact: secondContact }); });
    expect(result.current.formState.update).toBeNull();
    act(() => result.current.formState.handleResponse({ blockId: "notes", value: "Leave a message" }));
    act(() => result.current.formState.saveData());
    expect(saveFetcher.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ contact_id: 2, callId: null, update: { notes: "Leave a message" } }),
      expect.anything(),
    );
    act(() => { result.current.queueControls.switchQuestionContact({ contact: queueItem }); });
    expect(result.current.formState.update).toEqual({ q1: "yes", notes: "Call after 6 pm" });
  });

  test("a predictive connection to another contact clears the previous notes", async () => {
    dialType = "predictive";
    const secondContact = { ...queueItem, id: 2, contact_id: 2, contact: { ...queueItem.contact, id: 2 } };
    queueItems = [queueItem, secondContact];
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const { result, rerender } = renderHook(() => useCallScreen());
    act(() => result.current.formState.handleResponse({ blockId: "notes", value: "First contact only" }));
    expect(result.current.formState.update).toEqual({ notes: "First contact only" });
    roomState = { status: "connected", contact_id: 2 };
    rerender();
    expect(result.current.formState.questionContact?.contact.id).toBe(2);
    expect(result.current.formState.update).toBeNull();
  });

  test("notes without questionnaire answers use the existing autosave", async () => {
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const { CallScreenLayout } = await import("@/components/call/CallScreen.Layout");
    const { MemoryRouter } = await import("react-router");
    function CallScreen() {
      const model = useCallScreen();
      return <CallScreenLayout {...model} dialogControls={{ ...model.dialogControls, isDialogOpen: false, isErrorDialogOpen: false }} />;
    }
    vi.useFakeTimers();
    const view = render(<MemoryRouter><CallScreen /></MemoryRouter>);
    try {
      fireEvent.change(screen.getByRole("textbox", { name: "Notes", exact: true }), { target: { value: "Asked for a callback" } });
      expect(saveFetcher.submit).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(saveFetcher.submit).toHaveBeenCalledWith(
        expect.objectContaining({ contact_id: 1, callId: null, update: { notes: "Asked for a callback" } }),
        { method: "PATCH", action: "/api/questions", encType: "application/json" },
      );
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  test("Skip Person saves pending notes for the previous contact", async () => {
    queueItems = [queueItem, { ...queueItem, id: 2, contact_id: 2, contact: { ...queueItem.contact, id: 2 } }];
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useCallScreen());
    try {
      act(() => result.current.formState.handleResponse({ blockId: "notes", value: "First contact asked for a callback" }));
      act(() => vi.advanceTimersByTime(500));
      act(() => result.current.queueControls.handleNextNumber(false));
      expect(result.current.formState.questionContact?.contact.id).toBe(2);
      expect(saveFetcher.submit).toHaveBeenCalledWith(
        expect.objectContaining({ contact_id: 1, update: { notes: "First contact asked for a callback" } }),
        expect.anything(),
      );
      expect(result.current.formState.update).toBeNull();
      act(() => vi.advanceTimersByTime(2000));
      expect(saveFetcher.submit).toHaveBeenCalledTimes(1);
    } finally { unmount(); vi.useRealTimers(); }
  });

  test.each([{ contact_id: 2 }, { campaign_id: 2 }, { workspace: "other" }])("does not hydrate notes from an unrelated attempt: %j", async (mismatch) => {
    initialAttempt = {
      id: 31, contact_id: 1, campaign_id: 1, workspace: "ws", user_id: "user-1",
      created_at: new Date().toISOString(), disposition: "answered",
      result: { notes: "Another call's notes" }, ...mismatch,
    };
    const { useCallScreen } = await import("@/hooks/call/useCallScreen");
    const { result } = renderHook(() => useCallScreen());
    expect(result.current.formState.update).toBeNull();
  });
});
