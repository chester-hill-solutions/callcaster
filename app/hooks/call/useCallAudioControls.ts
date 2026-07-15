import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { logger } from "@/lib/logger.client";
import { playTone } from "@/lib/utils";
import { sendCallDigits } from "@/lib/twilio/twilio-call-adapter.client";
import type { MicCoordinator } from "@/lib/twilio/call-session-types";
import {
  getUsableAudioDevices,
  reconcileAudioDeviceId,
} from "@/hooks/call/audio-device-selection";

type UseCallAudioControlsOptions = {
  device: Device | null;
  activeCall: Call | null;
  micCoordinator: MicCoordinator;
};

export function useCallAudioControls({
  device,
  activeCall,
  micCoordinator,
}: UseCallAudioControlsOptions) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [microphone, setMicrophone] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [availableMicrophones, setAvailableMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [availableSpeakers, setAvailableSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const isMicrophoneMuted = micCoordinator.isMicMuted;

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = getUsableAudioDevices(devices, "audioinput");
      const speakers = getUsableAudioDevices(devices, "audiooutput");
      setAvailableMicrophones(microphones);
      setAvailableSpeakers(speakers);
      setMicrophone((current) => reconcileAudioDeviceId(microphones, current));
      setOutput((current) => reconcileAudioDeviceId(speakers, current));
    } catch (error) {
      logger.error("Error enumerating audio devices:", error);
      setAvailableMicrophones([]);
      setAvailableSpeakers([]);
      setMicrophone(null);
      setOutput(null);
    }
  }, []);

  const requestMicrophoneAccess = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      setStream(mediaStream);
      setPermissionError(null);
      await refreshDevices();
    } catch (error: unknown) {
      logger.error("Error accessing microphone:", error);
      if (error instanceof Error && error.name === "NotAllowedError") {
        setPermissionError(
          "Microphone access was denied. Please grant permission to use this feature.",
        );
        alert("Microphone access was denied. Please grant permission to use this feature.");
      } else {
        setPermissionError(
          "An error occurred while trying to access the microphone.",
        );
      }
    }
  }, [refreshDevices]);

  const handleMicrophoneChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setMicrophone(event.target.value);
    },
    [],
  );

  const handleSpeakerChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setOutput(event.target.value);
    },
    [],
  );

  const handleMuteMicrophone = useCallback(() => {
    if (!device?.audio) return;
    const newMuteState = !micCoordinator.isMicMuted;
    micCoordinator.setMicMuted(newMuteState);
    logger.debug("Mute active call", newMuteState);
  }, [device, micCoordinator]);

  const handleDTMF = useCallback(
    (key: string) => {
      if (audioContextRef.current) playTone(key, audioContextRef.current);
      sendCallDigits(activeCall, key);
    },
    [activeCall],
  );

  /**
   * @effect Create a Web Audio API AudioContext on mount for DTMF tone
   * playback (handleDTMF), and close it on unmount to release the audio
   * hardware resource.
   * @effect-deps [] — intentionally mount-once; the AudioContext should be
   * created exactly once per hook lifetime, not recreated per render.
   * @effect-side-effects dom (Web Audio API AudioContext construction/close)
   * @effect-why-not-loader Browser audio API object construction, not
   * request/response data.
   */
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", refreshDevices);
    };
  }, [refreshDevices]);

  useEffect(() => {
    if (!device?.audio) return;
    if (microphone) {
      device.audio.setInputDevice(microphone).catch((error: unknown) => {
        logger.error("Error setting microphone:", error);
      });
    }
    if (output) {
      device.audio.speakerDevices.set(output).catch((error: unknown) => {
        logger.error("Error setting speaker:", error);
      });
    }
  }, [device, microphone, output]);

  /**
   * @effect Auto-request microphone access whenever there's no live stream
   * and no prior permission error, so audio controls have a mic stream ready
   * by default (on mount, and again if the stream/error state is reset).
   * @effect-deps stream, permissionError, requestMicrophoneAccess (re-runs
   * whenever these change; the internal guard prevents repeated prompts once
   * a stream exists or permission was denied)
   * @effect-side-effects dom (navigator.mediaDevices.getUserMedia browser
   * permission prompt + enumerateDevices), no timer/subscription/analytics
   * @effect-why-not-loader Browser media-permission/hardware access is a
   * client-only side effect gated on user consent, not app request data.
   */
  useEffect(() => {
    if (!stream && !permissionError) {
      requestMicrophoneAccess();
    }
  }, [stream, permissionError, requestMicrophoneAccess]);

  return {
    stream,
    microphone,
    output,
    isMicrophoneMuted,
    availableMicrophones,
    availableSpeakers,
    permissionError,
    requestMicrophoneAccess,
    handleMicrophoneChange,
    handleSpeakerChange,
    handleMuteMicrophone,
    handleDTMF,
    audioContextRef,
  };
}
