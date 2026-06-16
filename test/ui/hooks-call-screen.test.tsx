import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createMockFetcher,
  createSupabaseRealtimeMock,
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

vi.mock("@/hooks/call/useSupabaseRoom", () => ({
  default: vi.fn(() => ({
    status: "online",
    users: [],
    predictiveState: { status: "idle", contact_id: null },
  })),
}));

vi.mock("@/lib/services/hooks-api", () => ({
  hangupCall: vi.fn().mockResolvedValue(undefined),
  startConferenceAndDial: vi.fn().mockResolvedValue({
    success: true,
    conferenceName: "conf-1",
  }),
}));

const fetcher = createMockFetcher({ submit: vi.fn() });
const queueFetcher = createMockFetcher({ submit: vi.fn() });
const verifyFetcher = createMockFetcher({ load: vi.fn(), data: { pin: "1234" } });
const revalidate = vi.fn();

const queueItem = {
  id: 1,
  contact_id: 1,
  campaign_id: 1,
  status: "queued",
  attempts: 0,
  contact: { id: 1, phone: "+15551234567", address: "123 Main" },
} as any;

let fetcherCall = 0;
const routeFetchers = [fetcher, queueFetcher, verifyFetcher];

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  const { supabase } = createSupabaseRealtimeMock();
  return {
    ...actual,
    useOutletContext: () => ({ supabase }),
    useNavigation: () => ({ state: "idle" }),
    useRevalidator: () => ({ revalidate }),
    useNavigate: () => vi.fn(),
    useFetcher: () => {
      const f = routeFetchers[fetcherCall % routeFetchers.length];
      fetcherCall += 1;
      return f;
    },
    useLoaderData: () => ({
      campaign: {
        id: 1,
        dial_type: "call",
        caller_id: "+15550000001",
        group_household_queue: false,
      },
      attempts: [],
      user: { id: "user-1" },
      workspaceId: "ws",
      campaignDetails: { script_id: 1 },
      credits: 100,
      contacts: [],
      queue: [queueItem],
      nextRecipient: queueItem,
      initalCallsList: [],
      initialRecentCall: null,
      initialRecentAttempt: null,
      token: "twilio-token",
      count: 0,
      completed: 0,
      isActive: true,
      hasAccess: true,
      verifiedNumbers: [],
    }),
  };
});

describe("useCallScreen", () => {
  beforeEach(() => {
    fetcherCall = 0;
    vi.clearAllMocks();
    vi.stubGlobal("alert", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/queues")) {
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ status: "in-progress" }), { status: 200 }),
        );
      }),
    );

    Object.assign(fetcher, { submit: vi.fn(), state: "idle", data: undefined });
    Object.assign(queueFetcher, { submit: vi.fn(), state: "idle" });
    Object.assign(verifyFetcher, { load: vi.fn(), data: { pin: "1234" } });

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
      createGain() {
        return { connect: vi.fn() };
      }
      close = vi.fn();
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("webkitAudioContext", MockAudioContext);
  });

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
    act(() => result.current.queueControls.requeueContacts());
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
});
