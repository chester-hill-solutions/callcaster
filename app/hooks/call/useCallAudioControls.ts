import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { logger } from "@/lib/logger.client";
import { playTone } from "@/lib/utils";
import { sendCallDigits } from "@/lib/twilio/twilio-call-adapter.client";
import { useTwilioAudioInput } from "./useTwilioAudioInput";
import type { MicCoordinator } from "@/lib/twilio/call-session-types";
import {
  getUsableAudioDevices,
  reconcileAudioDeviceId,
} from "@/hooks/call/audio-device-selection";

type UseCallAudioControlsOptions = {
  enabled?: boolean;
  device: Device | null;
  activeCall: Call | null;
  micCoordinator: MicCoordinator;
};

export function useCallAudioControls({
  enabled = true,
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
  const [inputError, setInputError] = useState<string | null>(null);
  const [selectedInput, setSelectedInput] = useState<{ device: Device; id: string } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneRequestGenerationRef = useRef(0);
  const selectInput = useTwilioAudioInput(enabled ? device : null);

  const isMicrophoneMuted = micCoordinator.isMicMuted;

  /**
   * @effect Release browser capture on suspension and invalidate late requests.
   * @effect-deps enabled (one generation per committed browser transport).
   * @effect-side-effects capture state is cleared; stream cleanup stops tracks.
   * @effect-why-not-loader Media acquisition is a browser-only operation.
   */
  useEffect(() => {
    const generation = ++microphoneRequestGenerationRef.current;
    if (!enabled) {
      setStream(null);
      setPermissionError(null);
    }
    return () => {
      if (microphoneRequestGenerationRef.current === generation) {
        microphoneRequestGenerationRef.current += 1;
      }
    };
  }, [enabled]);

  const refreshDevices = useCallback(async () => {
    if (!enabled) return;
    const generation = microphoneRequestGenerationRef.current;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (generation !== microphoneRequestGenerationRef.current) return;
      const microphones = getUsableAudioDevices(devices, "audioinput");
      const speakers = getUsableAudioDevices(devices, "audiooutput");
      setAvailableMicrophones(microphones);
      setAvailableSpeakers(speakers);
      setMicrophone((current) => reconcileAudioDeviceId(microphones, current));
      setOutput((current) => reconcileAudioDeviceId(speakers, current));
    } catch (error) {
      if (generation !== microphoneRequestGenerationRef.current) return;
      logger.error("Error enumerating audio devices:", error);
      setAvailableMicrophones([]);
      setAvailableSpeakers([]);
      setMicrophone(null);
      setOutput(null);
    }
  }, [enabled]);

  const requestMicrophoneAccess = useCallback(async () => {
    if (!enabled) return;
    const generation = microphoneRequestGenerationRef.current;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      if (microphoneRequestGenerationRef.current !== generation) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }

      setStream(mediaStream);
      setPermissionError(null);
      await refreshDevices();
    } catch (error: unknown) {
      if (microphoneRequestGenerationRef.current !== generation) return;
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
  }, [enabled, refreshDevices]);

  /**
   * @effect Stop microphone tracks when the stream is replaced or this hook unmounts.
   * @effect-deps stream (the stream whose tracks this hook owns).
   * @effect-side-effects media device capture is released by stopping each track.
   * @effect-why-not-loader This releases a browser media resource.
   */
  useEffect(() => {
    if (!stream) return;
    return () => {
      stream.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

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
    if (!enabled || !device?.audio) return;
    const newMuteState = !micCoordinator.isMicMuted;
    micCoordinator.setMicMuted(newMuteState);
    logger.debug("Mute active call", newMuteState);
  }, [enabled, device, micCoordinator]);

  const handleDTMF = useCallback(
    (key: string) => {
      if (!enabled) return;
      if (audioContextRef.current) playTone(key, audioContextRef.current);
      sendCallDigits(activeCall, key);
    },
    [enabled, activeCall],
  );

  /**
   * @effect Own a Web Audio API AudioContext while browser audio is enabled.
   * @effect-deps enabled (release on transport suspension or unmount).
   * @effect-side-effects dom (Web Audio API AudioContext construction/close)
   * @effect-why-not-loader Browser audio API object construction, not
   * request/response data.
   */
  useEffect(() => {
    if (!enabled) return;
    const context = new (window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    audioContextRef.current = context;
    return () => {
      context.close();
      if (audioContextRef.current === context) audioContextRef.current = null;
    };
  }, [enabled]);

  /**
   * @effect Enumerate audio devices on mount and subscribe to OS
   * devicechange events so mic/speaker pickers stay in sync with hardware.
   * @effect-deps enabled, refreshDevices (no browser routing in phone mode).
   * @effect-side-effects subscription (mediaDevices "devicechange" listener)
   * @effect-why-not-loader Browser hardware enumeration is a client-only API.
   */
  useEffect(() => {
    if (!enabled) return;
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
    };
  }, [enabled, refreshDevices]);

  /**
   * @effect Serialize microphone selection on the current SDK audio helper.
   * @effect-deps enabled, device, selectInput, microphone (browser ownership and input).
   * @effect-side-effects media capture through SDK setInputDevice.
   * @effect-why-not-loader Live browser hardware selection follows user input.
   */
  useEffect(() => {
    if (!enabled || !device || !microphone) return;
    let current = true;
    setSelectedInput(null);
    setInputError(null);
    void selectInput(microphone).then((ready) => {
      if (current && ready) setSelectedInput({ device, id: microphone });
    }).catch((error: unknown) => {
      if (current) setInputError("The microphone could not connect. Select another microphone or check the connection again.");
      logger.error("Error setting microphone:", error);
    });
    return () => { current = false; };
  }, [enabled, device, selectInput, microphone]);

  /**
   * @effect Apply the selected speaker to the current Twilio device.
   * @effect-deps enabled, device, output (browser ownership and speaker).
   * @effect-side-effects SDK speaker output routing.
   * @effect-why-not-loader Speaker routing is a live browser hardware operation.
   */
  useEffect(() => {
    if (!enabled || !device?.audio || !output) return;
    void device.audio.speakerDevices.set(output).catch((error: unknown) => {
      logger.error("Error setting speaker:", error);
    });
  }, [enabled, device, output]);

  /**
   * @effect Auto-request microphone access whenever there's no live stream
   * and no prior permission error, so audio controls have a mic stream ready
   * by default (on mount, and again if the stream/error state is reset).
   * @effect-deps enabled, stream, permissionError, requestMicrophoneAccess (re-runs
   * whenever these change; the internal guard prevents repeated prompts once
   * a stream exists or permission was denied)
   * @effect-side-effects dom (navigator.mediaDevices.getUserMedia browser
   * permission prompt + enumerateDevices), no timer/subscription/analytics
   * @effect-why-not-loader Browser media-permission/hardware access is a
   * client-only side effect gated on user consent, not app request data.
   */
  useEffect(() => {
    if (enabled && !stream && !permissionError) {
      requestMicrophoneAccess();
    }
  }, [enabled, stream, permissionError, requestMicrophoneAccess]);

  return {
    stream,
    microphone,
    output,
    isMicrophoneMuted,
    availableMicrophones,
    availableSpeakers,
    permissionError,
    inputError,
    inputReady: enabled && Boolean(stream) && selectedInput?.device === device && selectedInput?.id === microphone,
    requestMicrophoneAccess,
    handleMicrophoneChange,
    handleSpeakerChange,
    handleMuteMicrophone,
    handleDTMF,
    audioContextRef,
  };
}
