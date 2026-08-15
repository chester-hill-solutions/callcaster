import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  useCampaignDequeueActions,
  useCampaignDialActions,
} from "@/hooks/call/useCampaignDialActions";

const baseCampaign = {
  id: "camp-1",
  dial_type: "call",
  group_household_queue: false,
} as import("@/lib/types").Campaign;

const predictiveCampaign = {
  ...baseCampaign,
  dial_type: "predictive",
} as import("@/lib/types").Campaign;

const contact = { id: "c1", phone: "+15551234567" } as import("@/lib/types").Contact;
const nextRecipient = {
  id: "q1",
  contact,
} as import("@/lib/types").QueueItem;

describe("useCampaignDialActions", () => {
  test("predictive dial calls begin when device is ready", () => {
    const begin = vi.fn();
    const startCall = vi.fn();
    const { result } = renderHook(() =>
      useCampaignDialActions({
        campaign: predictiveCampaign,
        deviceIsBusy: false,
        incomingCall: null,
        deviceStatus: "Registered",
        begin,
        startCall,
        nextRecipient,
        user: { id: "u1" },
        workspaceId: "ws",
        recentAttempt: null,
        selectedDevice: "computer",
      }),
    );

    act(() => result.current());
    expect(begin).toHaveBeenCalledTimes(1);
    expect(startCall).not.toHaveBeenCalled();
  });

  test("predictive dial is blocked when device is busy or not registered", () => {
    const begin = vi.fn();
    const startCall = vi.fn();
    const { result: busyResult } = renderHook(() =>
      useCampaignDialActions({
        campaign: predictiveCampaign,
        deviceIsBusy: true,
        incomingCall: null,
        deviceStatus: "Registered",
        begin,
        startCall,
        nextRecipient,
        user: { id: "u1" },
        workspaceId: "ws",
        recentAttempt: null,
        selectedDevice: "computer",
      }),
    );

    act(() => busyResult.current());
    expect(begin).not.toHaveBeenCalled();

    const { result: notReadyResult } = renderHook(() =>
      useCampaignDialActions({
        campaign: predictiveCampaign,
        deviceIsBusy: false,
        incomingCall: null,
        deviceStatus: "connecting",
        begin,
        startCall,
        nextRecipient,
        user: { id: "u1" },
        workspaceId: "ws",
        recentAttempt: null,
        selectedDevice: "computer",
      }),
    );
    act(() => notReadyResult.current());
    expect(begin).not.toHaveBeenCalled();
  });

  test("manual dial starts call for next recipient", () => {
    const begin = vi.fn();
    const startCall = vi.fn();
    const send = vi.fn();
    const { result } = renderHook(() =>
      useCampaignDialActions({
        campaign: baseCampaign,
        deviceIsBusy: false,
        incomingCall: null,
        deviceStatus: "Registered",
        callState: "idle",
        begin,
        startCall,
        nextRecipient,
        user: { id: "u1" },
        workspaceId: "ws",
        recentAttempt: null,
        selectedDevice: "computer",
        send,
      }),
    );

    act(() => result.current());
    expect(startCall).toHaveBeenCalledWith({
      contact,
      campaign: baseCampaign,
      user: { id: "u1" },
      workspaceId: "ws",
      nextRecipient,
      recentAttempt: null,
      selectedDevice: "computer",
    });
    expect(begin).not.toHaveBeenCalled();
  });
});

describe("useCampaignDequeueActions", () => {
  test("predictive dequeue hangs up and re-dials", () => {
    const send = vi.fn();
    const setCallDuration = vi.fn();
    const handleDialButton = vi.fn();
    const saveData = vi.fn();
    const dequeue = vi.fn();

    const { result } = renderHook(() =>
      useCampaignDequeueActions({
        campaign: predictiveCampaign,
        questionContact: nextRecipient,
        send,
        setCallDuration,
        handleDialButton,
        saveData,
        dequeue,
        fetchMore: vi.fn(),
        householdMap: {},
        handleNextNumber: vi.fn(),
        setRecentAttempt: vi.fn(),
        setUpdate: vi.fn(),
      }),
    );

    act(() => result.current());
    expect(send).toHaveBeenCalledWith({ type: "HANG_UP" });
    expect(setCallDuration).toHaveBeenCalledWith(0);
    expect(handleDialButton).toHaveBeenCalledTimes(1);
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(dequeue).not.toHaveBeenCalled();
  });

  test("manual dequeue saves, dequeues, and advances queue", () => {
    const send = vi.fn();
    const setCallDuration = vi.fn();
    const handleDialButton = vi.fn();
    const saveData = vi.fn();
    const dequeue = vi.fn();
    const fetchMore = vi.fn();
    const handleNextNumber = vi.fn();
    const setRecentAttempt = vi.fn();
    const setUpdate = vi.fn();

    const { result } = renderHook(() =>
      useCampaignDequeueActions({
        campaign: baseCampaign,
        questionContact: nextRecipient,
        send,
        setCallDuration,
        handleDialButton,
        saveData,
        dequeue,
        fetchMore,
        householdMap: { h1: [nextRecipient] },
        handleNextNumber,
        setRecentAttempt,
        setUpdate,
      }),
    );

    act(() => result.current());
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(dequeue).toHaveBeenCalledWith({ contact: nextRecipient });
    expect(fetchMore).toHaveBeenCalledWith({ householdMap: { h1: [nextRecipient] } });
    expect(handleNextNumber).toHaveBeenCalledWith(false);
    // NEXT (not HANG_UP): advancing the queue must not park the FSM in
    // "completed" from idle — the next dial flashed that stale outcome (#1220).
    expect(send).toHaveBeenCalledWith({ type: "NEXT" });
    expect(setRecentAttempt).toHaveBeenCalledWith(null);
    expect(setUpdate).toHaveBeenCalledWith({});
    expect(setCallDuration).toHaveBeenCalledWith(0);
    expect(handleDialButton).not.toHaveBeenCalled();
  });

  // Regression for #1253: "Save and Next" used to early-return whenever the
  // queue's nextRecipient pointer was empty — which is exactly what
  // hangup.action.server.ts's dequeue produces the instant the agent hangs
  // up on the last queued contact. The gate (and the dequeue target) must
  // follow questionContact — the contact the panel is showing — so the
  // button still works with an empty queue right after a call ends.
  test("#1253: manual dequeue still saves/dequeues/advances when the queue is empty but questionContact is set", () => {
    const send = vi.fn();
    const setCallDuration = vi.fn();
    const handleDialButton = vi.fn();
    const saveData = vi.fn();
    const dequeue = vi.fn();
    const fetchMore = vi.fn();
    const handleNextNumber = vi.fn();
    const setRecentAttempt = vi.fn();
    const setUpdate = vi.fn();

    const { result } = renderHook(() =>
      useCampaignDequeueActions({
        campaign: baseCampaign,
        questionContact: nextRecipient,
        send,
        setCallDuration,
        handleDialButton,
        saveData,
        dequeue,
        fetchMore,
        // The queue is empty — this is the "0 of 1 remaining" screenshot
        // from #1253, reached after hangup.action dequeued the sole contact.
        householdMap: {},
        handleNextNumber,
        setRecentAttempt,
        setUpdate,
      }),
    );

    act(() => result.current());
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(dequeue).toHaveBeenCalledWith({ contact: nextRecipient });
    expect(handleNextNumber).toHaveBeenCalled();
  });

  test("no-ops when there is no campaign or no questionContact", () => {
    const saveData = vi.fn();
    const dequeue = vi.fn();

    const { result } = renderHook(() =>
      useCampaignDequeueActions({
        campaign: baseCampaign,
        questionContact: null,
        send: vi.fn(),
        setCallDuration: vi.fn(),
        handleDialButton: vi.fn(),
        saveData,
        dequeue,
        fetchMore: vi.fn(),
        householdMap: {},
        handleNextNumber: vi.fn(),
        setRecentAttempt: vi.fn(),
        setUpdate: vi.fn(),
      }),
    );

    act(() => result.current());
    expect(saveData).not.toHaveBeenCalled();
    expect(dequeue).not.toHaveBeenCalled();
  });
});
