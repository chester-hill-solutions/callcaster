import React, { useState, useEffect, useCallback, useRef } from "react";
import { Device } from "@twilio/voice-sdk";
import { Button } from "~/components/ui/button";
import {
  MdMic,
  MdMicOff,
  MdFiberManualRecord,
  MdStop,
  MdPlayArrow,
} from "react-icons/md";
import DeviceSelector from "./AudioSelector";

interface InputSelectorProps {
  device: Device;
}

const InputSelector: React.FC<InputSelectorProps> = ({ device }) => {
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const getDefaultDevice = useCallback(() => {
    if (!device?.audio) return null;
    const speakerDevices = device.audio.speakerDevices.get();
    return speakerDevices.size > 0 ? Array.from(speakerDevices)[0] : null;
  }, [device]);

  const handleDeviceChange = useCallback(() => {
    if (!device?.audio) {
      setError("Audio interface is not available");
      setIsLoading(false);
      return;
    }

    const availableDevices = device.audio.availableInputDevices;

    if (!availableDevices || availableDevices.size === 0) {
      setError("No input devices available");
      setIsLoading(false);
      return;
    }

    const deviceArray = Array.from(availableDevices.values());
    setInputDevices(deviceArray);

    const defaultDevice = getDefaultDevice();
    if (
      defaultDevice &&
      (!selectedDeviceId || !availableDevices.has(selectedDeviceId))
    ) {
      setSelectedDeviceId(defaultDevice.deviceId);
    }

    setIsLoading(false);
    setError(null);
  }, [device, selectedDeviceId, getDefaultDevice]);

  const checkMicrophonePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setHasPermission(true);
    } catch (err) {
      console.error("Microphone permission error:", err);
      setHasPermission(false);
      setError("Microphone permission denied");
    }
  }, []);

  useEffect(() => {
    checkMicrophonePermission();
  }, [checkMicrophonePermission]);

  const initializeDevices = useCallback(() => {
    let retryCount = 0;
    const maxRetries = 5;
    const retryInterval = 1000;

    const tryInitialize = () => {
      if (
        device?.audio?.availableInputDevices &&
        device?.audio?.availableInputDevices?.size > 0
      ) {
        handleDeviceChange();
      } else if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(tryInitialize, retryInterval);
      } else {
        setError("Failed to initialize audio devices after multiple attempts");
        setIsLoading(false);
      }
    };

    tryInitialize();
  }, [device, handleDeviceChange]);

  useEffect(() => {
    if (!device) {
      setError("Device is undefined");
      setIsLoading(false);
      return;
    }

    device.audio?.on("deviceChange", handleDeviceChange);

    initializeDevices();

    return () => {
      device.audio?.off("deviceChange", handleDeviceChange);
    };
  }, [device, handleDeviceChange, initializeDevices]);

  const toggleMute = () => {
    if (device?.audio) {
      const newMuteState = !isMuted;
      device.audio.outgoing(newMuteState);
      setIsMuted(newMuteState);
    }
  };

  const startRecording = async () => {
    if (!hasPermission) {
      await checkMicrophonePermission();
      if (!hasPermission) return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/wav",
        });
        setAudioBlob(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      setTimeout(() => stopRecording(), 5000);
    } catch (err) {
      console.error("Error starting recording:", err);
      setError("Failed to start recording");
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playRecording = () => {
    if (audioBlob) {
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    }
  };

  const handleTestClick = () => {
    if (isRecording) {
      stopRecording();
    } else if (audioBlob && !isPlaying) {
      playRecording();
    } else {
      startRecording();
    }
  };

  if (isLoading) {
    return <div>Loading audio devices...</div>;
  }

  if (hasPermission === false) {
    return <div>Microphone permission is required to use this feature.</div>;
  }

  return (
    <div className="flex flex-col space-x-2 sm:flex-row sm:items-center">
      <DeviceSelector
        devices={inputDevices}
        onDeviceChange={setSelectedDeviceId}
        selectedDeviceId={selectedDeviceId}
      />
      <div className="flex flex-1 sm:w-[125px]">
        <Button
          onClick={handleTestClick}
          disabled={isPlaying}
          className="rounded-r-none"
          variant={"outline"}
        >
          {isRecording ? <MdStop /> : <MdFiberManualRecord />}
          {isRecording ? "Stop" : "Test"}
        </Button>
        <Button
          onClick={playRecording}
          disabled={!audioBlob || isRecording || isPlaying}
          className="rounded-l-none border-l"
          variant={"outline"}
        >
          <MdPlayArrow />
        </Button>
      </div>
      <Button
        variant="outline"
        onClick={toggleMute}
        className={`flex w-[125px] gap-1 transition-colors ${isMuted ? "bg-red-100 text-red-500 hover:bg-red-200" : ""}`}
      >
        {isMuted ? (
          <>
            <MdMicOff className="text-red-500" />
            MUTED
          </>
        ) : (
          <>
            <MdMic />
            MUTE
          </>
        )}
      </Button>
    </div>
  );
};

export default InputSelector;
