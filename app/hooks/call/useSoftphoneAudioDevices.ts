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
