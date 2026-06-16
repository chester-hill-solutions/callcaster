import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import {
  replaceCallInputStream,
  setCallMuted,
} from "@/lib/twilio/twilio-call-adapter.client";

type UseSoftphoneAudioDevicesOptions = {
  device: Device | null;
  activeCall: Call | null;
  micSelectIdPrefix?: string;
  speakerSelectIdPrefix?: string;
};

export function useSoftphoneAudioDevices({
  device,
  activeCall,
}: UseSoftphoneAudioDevicesOptions) {
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [callOnHold, setCallOnHold] = useState(false);

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
    setCallOnHold(false);
    setMicMuted(false);
  }, [activeCall]);

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
          setMicMuted(false);
          if (activeCall) {
            navigator.mediaDevices
              .getUserMedia({ audio: { deviceId } })
              .then((stream) => replaceCallInputStream(activeCall, stream))
              .catch(() => {});
          }
        })
        .catch(() => {});
    },
    [device, activeCall],
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
    const next = !micMuted;
    setMicMuted(next);
    if (next) setCallOnHold(false);
    device.audio.outgoing(next);
    setCallMuted(activeCall, next);
  }, [device, activeCall, micMuted]);

  const handleHold = useCallback(() => {
    if (!activeCall) return;
    setCallOnHold(true);
    setMicMuted(true);
    if (device?.audio) device.audio.outgoing(true);
    setCallMuted(activeCall, true);
  }, [activeCall, device]);

  const handleResume = useCallback(() => {
    if (!activeCall) return;
    setCallOnHold(false);
    setMicMuted(false);
    if (device?.audio) device.audio.outgoing(false);
    setCallMuted(activeCall, false);
  }, [activeCall, device]);

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
    micMuted,
    speakerMuted,
    callOnHold,
    handleMicChange,
    handleSpeakerChange,
    handleMuteMic,
    handleHold,
    handleResume,
    handleMuteSpeaker,
  };
}
