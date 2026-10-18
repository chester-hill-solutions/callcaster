import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { EventEmitter } from "node:events";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createCallAudioInput } from "@/lib/twilio/call-audio-input.client";
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
  let stopMicrophoneTrack: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setInputDevice.mockResolvedValue(undefined);
    setSpeakerDevice.mockResolvedValue(undefined);
    stopMicrophoneTrack = vi.fn();
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
          getTracks: () => [{ stop: stopMicrophoneTrack }],
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

  test.each(["unmount", "replacement"] as const)(
    "releases SDK microphone capture that resolves after %s",
    async (exit) => {
      const require = createRequire(import.meta.url);
      const sdkEntry = require.resolve("@twilio/voice-sdk");
      const { default: AudioHelper } = require(join(dirname(sdkEntry), "twilio/audiohelper.js"));
      let resolveSdkStream!: (stream: MediaStream) => void;
      const acquireSdkStream = vi.fn(() => new Promise<MediaStream>((resolve) => {
        resolveSdkStream = resolve;
      }));
      const track = {
        readyState: "live",
        stop() { track.readyState = "ended"; },
      };
      const sdkStream = { getTracks: () => [track] } as unknown as MediaStream;
      vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
      const audio = new AudioHelper(async () => {}, async () => {}, {
        mediaDevices: {
          enumerateDevices: async () => devices,
          addEventListener() {},
          removeEventListener() {},
        },
        getUserMedia: acquireSdkStream,
        audioContext: {
          createAnalyser: () => ({ frequencyBinCount: 16 }),
          createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
        },
        audioProcessorEventObserver: new EventEmitter(),
        setSinkId: async () => {},
      });
      const original = { audio } as unknown as import("@twilio/voice-sdk").Device;
      const replacement = {
        audio: {
          setInputDevice: vi.fn(async () => {}),
          unsetInputDevice: vi.fn(async () => {}),
          speakerDevices: { set: vi.fn(async () => {}) },
        },
      } as unknown as import("@twilio/voice-sdk").Device;
      const hook = renderHook(({ device }) => useCallAudioControls({
        device,
        activeCall: null,
        micCoordinator: { isMicMuted: false, setMicMuted },
      }), { initialProps: { device: original } });
      try {
        await waitFor(() => expect(acquireSdkStream).toHaveBeenCalledTimes(1));
        audio._destroy();
        if (exit === "unmount") hook.unmount();
        else hook.rerender({ device: replacement });
        await act(async () => resolveSdkStream(sdkStream));
        await waitFor(() => expect(track.readyState).toBe("ended"));
        expect(audio.inputStream).toBeNull();
        expect(audio._isPollingInputVolume).toBe(false);
      } finally {
        hook.unmount();
        audio._destroy();
        vi.unstubAllGlobals();
      }
    },
  );

  test("queued microphone selections cannot open capture after disposal", async () => {
    let finishFirst!: () => void;
    let selected: string | null = null;
    const started: string[] = [];
    const owner = createCallAudioInput({
      setInputDevice: async (id) => {
        started.push(id);
        await new Promise<void>((resolve) => { finishFirst = resolve; });
        selected = id;
      },
      unsetInputDevice: async () => { selected = null; },
    });
    const first = owner.select("default");
    await Promise.resolve();
    const second = owner.select("usb-mic");
    const release = owner.dispose();
    expect(started).toEqual(["default"]);
    finishFirst();
    await Promise.all([first, second, release]);
    expect(started).toEqual(["default"]);
    expect(selected).toBeNull();
    expect(owner.dispose()).toBe(release);
  });

  test("a failed selection does not block later microphone changes or release", async () => {
    let selected: string | null = null;
    const owner = createCallAudioInput({
      setInputDevice: async (id) => {
        if (id === "removed-mic") throw new Error("Device removed");
        selected = id;
      },
      unsetInputDevice: async () => { selected = null; },
    });
    await expect(owner.select("removed-mic")).rejects.toThrow("Device removed");
    await owner.select("default");
    expect(selected).toBe("default");
    await owner.dispose();
    expect(selected).toBeNull();
    await owner.select("usb-mic");
    expect(selected).toBeNull();
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
        unsetInputDevice: vi.fn(async () => {}),
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
        unsetInputDevice: vi.fn(async () => {}),
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

  test("campaign controls stop microphone tracks when the call screen unmounts", async () => {
    const { unmount } = renderHook(() =>
      useCallAudioControls({
        device: null,
        activeCall: null,
        micCoordinator: { isMicMuted: false, setMicMuted },
      }),
    );

    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1),
    );
    unmount();

    expect(stopMicrophoneTrack).toHaveBeenCalledTimes(1);
  });

  test("campaign controls stop a microphone stream that resolves after unmount", async () => {
    let resolveMicrophoneStream!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveMicrophoneStream = resolve;
        }),
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn(async () => devices),
        getUserMedia,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    const stream = {
      getTracks: () => [{ stop: stopMicrophoneTrack }],
    } as unknown as MediaStream;

    const { unmount } = renderHook(() =>
      useCallAudioControls({
        device: null,
        activeCall: null,
        micCoordinator: { isMicMuted: false, setMicMuted },
      }),
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => resolveMicrophoneStream(stream));

    expect(stopMicrophoneTrack).toHaveBeenCalledTimes(1);
  });
});
