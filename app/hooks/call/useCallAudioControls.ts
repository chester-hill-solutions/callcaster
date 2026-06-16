import { useCallback, useEffect, useRef, useState } from "react";
import type { Call } from "@twilio/voice-sdk";
import { logger } from "@/lib/logger.client";
import { playTone } from "@/lib/utils";
import {
  replaceCallInputStream,
  sendCallDigits,
  setCallMuted,
} from "@/lib/twilio/twilio-call-adapter.client";

type UseCallAudioControlsOptions = {
  device: import("@twilio/voice-sdk").Device | null;
  activeCall: Call | null;
};

export function useCallAudioControls({ device, activeCall }: UseCallAudioControlsOptions) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [microphone, setMicrophone] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState(false);
  const [availableMicrophones, setAvailableMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [availableSpeakers, setAvailableSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const requestMicrophoneAccess = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableMicrophones(devices.filter((d) => d.kind === "audioinput"));
      setAvailableSpeakers(devices.filter((d) => d.kind === "audiooutput"));
      const audioContext = new window.AudioContext();
      audioContextRef.current = audioContext;
      const gainNode = audioContext.createGain();
      gainNodeRef.current = gainNode;
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      setStream(mediaStream);
      setPermissionError(null);
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
  }, []);

  const handleMicrophoneChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      if (!device) {
        logger.error("No device available");
        return;
      }
      const selectedMicrophone = event.target.value;
      const audio = device.audio;
      audio?.setInputDevice(selectedMicrophone).then(() => {
        setIsMicrophoneMuted(false);
        setMicrophone(selectedMicrophone);
        logger.debug("Microphone set to", selectedMicrophone);

        navigator.mediaDevices
          .getUserMedia({ audio: { deviceId: selectedMicrophone } })
          .then((newStream) => {
            if (activeCall) {
              replaceCallInputStream(activeCall, newStream)
                .then(() => {
                  logger.debug("Active call input tracks updated with new microphone");
                })
                .catch((error: unknown) => {
                  logger.error("Error updating active call input tracks:", error);
                });
            }
          })
          .catch((error: unknown) => {
            logger.error("Error getting stream from new microphone:", error);
          });
      }).catch((error: unknown) => {
        logger.error("Error setting microphone:", error);
      });
    },
    [device, activeCall],
  );

  const handleSpeakerChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      if (!device) {
        logger.error("No device available");
        return;
      }
      const selectedSpeaker = event.target.value;
      setOutput(selectedSpeaker);
      device.audio?.speakerDevices.set(selectedSpeaker).then(() => {
        logger.debug("Speaker set to", selectedSpeaker);
      }).catch((error: unknown) => {
        logger.error("Error setting speaker:", error);
      });
    },
    [device],
  );

  const handleMuteMicrophone = useCallback(() => {
    if (!device?.audio) return;
    const newMuteState = !isMicrophoneMuted;
    setIsMicrophoneMuted(newMuteState);
    device.audio.incoming(newMuteState);
    if (activeCall) {
      logger.debug("Mute active call", newMuteState);
      setCallMuted(activeCall, newMuteState);
    }
  }, [device, activeCall, isMicrophoneMuted]);

  const handleDTMF = useCallback(
    (key: string) => {
      if (audioContextRef.current) playTone(key, audioContextRef.current);
      sendCallDigits(activeCall, key);
    },
    [activeCall],
  );

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
