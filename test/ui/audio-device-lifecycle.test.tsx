import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useCallAudioControls } from "@/hooks/call/useCallAudioControls";
import { useSoftphoneAudioDevices } from "@/hooks/call/useSoftphoneAudioDevices";
import {
  getUsableAudioDevices,
  reconcileAudioDeviceId,
} from "@/hooks/call/audio-device-selection";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function audioDevice(
  kind: "audioinput" | "audiooutput",
  deviceId: string,
  label: string,
): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: "", toJSON: () => ({}) };
}

describe("audio device lifecycle", () => {
  let devices: MediaDeviceInfo[];
  let deviceChange: (() => void) | undefined;
  const setInputDevice = vi.fn().mockResolvedValue(undefined);
  const setSpeakerDevice = vi.fn().mockResolvedValue(undefined);
  const setMicMuted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setInputDevice.mockResolvedValue(undefined);
    setSpeakerDevice.mockResolvedValue(undefined);
    deviceChange = undefined;
    devices = [
      audioDevice("audioinput", "default", "Default microphone"),
      audioDevice("audioinput", "usb-mic", "USB microphone"),
      audioDevice("audiooutput", "default", "Default speaker"),
    ];

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn(async () => devices),
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
        addEventListener: vi.fn((_event: string, listener: () => void) => {
          deviceChange = listener;
        }),
        removeEventListener: vi.fn(),
      },
    });

    class MockAudioContext {
      close = vi.fn();
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
  });

  test("does not turn an anonymous device into a synthetic default", () => {
    const usable = getUsableAudioDevices(
      [audioDevice("audioinput", "", "")],
      "audioinput",
    );

    expect(usable).toEqual([]);
    expect(reconcileAudioDeviceId(usable, null)).toBeNull();
  });

  test("softphone falls back after unplug and preserves microphone mute", async () => {
    const device = {
      audio: {
        setInputDevice,
        speakerDevices: { set: setSpeakerDevice },
      },
    } as unknown as import("@twilio/voice-sdk").Device;
    const { result } = renderHook(() =>
      useSoftphoneAudioDevices({
        device,
        activeCall: null,
        micCoordinator: { isMicMuted: true, setMicMuted },
      }),
    );

    await waitFor(() => expect(result.current.selectedMicId).toBe("default"));
    act(() => result.current.handleMicChange("usb-mic"));
    await waitFor(() => expect(result.current.selectedMicId).toBe("usb-mic"));
    expect(setMicMuted).not.toHaveBeenCalled();

    devices = [
      audioDevice("audioinput", "default", "Default microphone"),
      audioDevice("audiooutput", "default", "Default speaker"),
    ];
    await act(async () => {
      deviceChange?.();
    });

    await waitFor(() => expect(result.current.selectedMicId).toBe("default"));
    expect(result.current.micMuted).toBe(true);
    expect(setMicMuted).not.toHaveBeenCalled();
  });

  test("campaign controls re-enumerate and apply unplug fallback", async () => {
    const device = {
      audio: {
        setInputDevice,
        speakerDevices: { set: setSpeakerDevice },
      },
    } as unknown as import("@twilio/voice-sdk").Device;
    const { result } = renderHook(() =>
      useCallAudioControls({
        device,
        activeCall: null,
        micCoordinator: { isMicMuted: true, setMicMuted },
      }),
    );

    await waitFor(() => expect(result.current.microphone).toBe("default"));
    act(() =>
      result.current.handleMicrophoneChange({
        target: { value: "usb-mic" },
      } as React.ChangeEvent<HTMLSelectElement>),
    );
    await waitFor(() => expect(result.current.microphone).toBe("usb-mic"));

    devices = [
      audioDevice("audioinput", "default", "Default microphone"),
      audioDevice("audiooutput", "default", "Default speaker"),
    ];
    await act(async () => {
      deviceChange?.();
    });

    await waitFor(() => expect(result.current.microphone).toBe("default"));
    expect(setInputDevice).toHaveBeenLastCalledWith("default");
    expect(result.current.isMicrophoneMuted).toBe(true);
    expect(setMicMuted).not.toHaveBeenCalled();
  });
});
