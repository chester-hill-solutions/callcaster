import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import {
  logTwilioAdapterResult,
  replaceCallInputStream,
} from "@/lib/twilio/twilio-call-adapter.client";
import type { MicCoordinator } from "@/lib/twilio/call-session-types";

type UseSoftphoneAudioDevicesOptions = {
  device: Device | null;
  activeCall: Call | null;
  micCoordinator: MicCoordinator;
  micSelectIdPrefix?: string;
  speakerSelectIdPrefix?: string;
};

/**
 * Audio device selection and local speaker mute — mic mute is coordinated by call session owner.
 */
export function useSoftphoneAudioDevices({
  device,
  activeCall,
  micCoordinator,
}: UseSoftphoneAudioDevicesOptions) {
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [speakerMuted, setSpeakerMuted] = useState(false);

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(devices.filter((d) => d.kind === "audioinput"));
      setSpeakers(devices.filter((d) => d.kind === "audiooutput"));
      if (
        selectedMicId === "" &&
        devices.some((d) => d.kind === "audioinput")
      ) {
        const first = devices.find((d) => d.kind === "audioinput");
        if (first?.deviceId) setSelectedMicId(first.deviceId);
      }
      if (
        selectedSpeakerId === "" &&
        devices.some((d) => d.kind === "audiooutput")
      ) {
        const first = devices.find((d) => d.kind === "audiooutput");
        if (first?.deviceId) setSelectedSpeakerId(first.deviceId);
      }
    } catch {
      setMicrophones([]);
      setSpeakers([]);
    }
  }, [selectedMicId, selectedSpeakerId]);

  const permissionRequestedRef = useRef(false);
  /**
   * @effect On mount, enumerate audio devices, request microphone permission
   * once (so device labels are populated), and subscribe to the OS
   * "devicechange" event to keep the mic/speaker lists fresh as hardware is
   * plugged/unplugged.
   * @effect-deps refreshDevices (a useCallback that changes identity only when
   * selectedMicId/selectedSpeakerId change, causing a controlled resubscribe
   * so the "pick a default device" logic inside it sees current selections)
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
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () =>
      navigator.mediaDevices?.removeEventListener("devicechange", refreshDevices);
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
        .then(() => {
          micCoordinator.setMicMuted(false);
          if (activeCall) {
            navigator.mediaDevices
              .getUserMedia({ audio: { deviceId } })
              .then((stream) =>
                replaceCallInputStream(activeCall, stream).then((result) =>
                  logTwilioAdapterResult(result, "replaceCallInputStream"),
                ),
              )
              .catch(() => {});
          }
        })
        .catch(() => {});
    },
    [device, activeCall, micCoordinator],
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

  const handleMuteSpeaker = useCallback(() => {
    if (!device?.audio) return;
    const next = !speakerMuted;
    setSpeakerMuted(next);
    device.audio.incoming(next);
  }, [device, speakerMuted]);

  return {
    microphones,
    speakers,
    selectedMicId,
    selectedSpeakerId,
    micMuted: micCoordinator.isMicMuted,
    speakerMuted,
    handleMicChange,
    handleSpeakerChange,
    handleMuteMic,
    handleMuteSpeaker,
  };
}
