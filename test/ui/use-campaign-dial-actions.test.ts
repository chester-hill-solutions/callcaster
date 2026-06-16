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
    const { result } = renderHook(() =>
      useCampaignDialActions({
        campaign: baseCampaign,
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
        nextRecipient,
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
        nextRecipient,
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
    expect(send).toHaveBeenCalledWith({ type: "HANG_UP" });
    expect(setRecentAttempt).toHaveBeenCalledWith(null);
    expect(setUpdate).toHaveBeenCalledWith({});
    expect(setCallDuration).toHaveBeenCalledWith(0);
    expect(handleDialButton).not.toHaveBeenCalled();
  });
});
