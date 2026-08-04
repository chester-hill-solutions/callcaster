import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import type { MicCoordinator } from "@/lib/twilio/call-session-types";
import {
  getUsableAudioDevices,
  reconcileAudioDeviceId,
} from "@/hooks/call/audio-device-selection";

type UseSoftphoneAudioDevicesOptions = {
  device: Device | null;
  activeCall: Call | null;
  micCoordinator: MicCoordinator;
  micSelectIdPrefix?: string;
  speakerSelectIdPrefix?: string;
};

/** Audio device selection — mic mute is coordinated by the call session owner. */
export function useSoftphoneAudioDevices({
  device,
  activeCall,
  micCoordinator,
}: UseSoftphoneAudioDevicesOptions) {
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextMicrophones = getUsableAudioDevices(devices, "audioinput");
      const nextSpeakers = getUsableAudioDevices(devices, "audiooutput");
      setMicrophones(nextMicrophones);
      setSpeakers(nextSpeakers);
      setSelectedMicId((current) =>
        reconcileAudioDeviceId(nextMicrophones, current),
      );
      setSelectedSpeakerId((current) =>
        reconcileAudioDeviceId(nextSpeakers, current),
      );
    } catch {
      setMicrophones([]);
      setSpeakers([]);
      setSelectedMicId(null);
      setSelectedSpeakerId(null);
    }
  }, []);

  const permissionRequestedRef = useRef(false);
  /**
   * @effect On mount, enumerate audio devices, request microphone permission
   * once (so device labels are populated), and subscribe to the OS
   * "devicechange" event to keep the mic/speaker lists fresh as hardware is
   * plugged/unplugged.
   * @effect-deps refreshDevices (stable callback; state reconciliation uses
   * functional updates so the listener always sees the current selection)
   * @effect-side-effects subscription (mediaDevices "devicechange" listener,
   * removed on unmount/refreshDevices change) + dom (getUserMedia permission
   * prompt, requested at most once via permissionRequestedRef)
   * @effect-why-not-loader Browser hardware device enumeration and permission
   * prompts are client-only APIs, not app request/response data.
   */
  useEffect(() => {
    refreshDevices();
    if (
      !permissionRequestedRef.current &&
      typeof navigator?.mediaDevices?.getUserMedia === "function"
    ) {
      permissionRequestedRef.current = true;
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
          refreshDevices();
        })
        .catch(() => {});
    }
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () =>
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  /**
   * @effect When a call becomes active (or the selected mic/speaker changes
   * while a call is active), apply the currently selected input/output
   * devices to the live Twilio Device's audio helper.
   * @effect-deps activeCall, device, selectedMicId, selectedSpeakerId (reacts
   * to a call starting or the user changing device selection mid-call)
   * @effect-side-effects dom (imperative Device.audio.setInputDevice /
   * speakerDevices.set calls against the WebRTC audio hardware); no
   * timer/subscription/fetch.
   * @effect-why-not-loader Imperative SDK/audio-hardware binding tied to an
   * active call, not request/response data.
   */
  useEffect(() => {
    if (!activeCall || !device?.audio) return;
    if (selectedMicId) {
      device.audio.setInputDevice(selectedMicId).catch(() => {});
    }
    if (selectedSpeakerId) {
      device.audio.speakerDevices?.set(selectedSpeakerId).catch(() => {});
    }
  }, [activeCall, device, selectedMicId, selectedSpeakerId]);

  const handleMicChange = useCallback(
    (deviceId: string) => {
      setSelectedMicId(deviceId);
      if (!device?.audio) return;
      device.audio
        .setInputDevice(deviceId)
        .catch(() => {});
    },
    [device],
  );

  const handleSpeakerChange = useCallback(
    (deviceId: string) => {
      setSelectedSpeakerId(deviceId);
      device?.audio?.speakerDevices?.set(deviceId).catch(() => {});
    },
    [device],
  );

  const handleMuteMic = useCallback(() => {
    if (!device?.audio) return;
    micCoordinator.setMicMuted(!micCoordinator.isMicMuted);
  }, [device, micCoordinator]);

  return {
    microphones,
    speakers,
    selectedMicId,
    selectedSpeakerId,
    micMuted: micCoordinator.isMicMuted,
    handleMicChange,
    handleSpeakerChange,
    handleMuteMic,
  };
}
