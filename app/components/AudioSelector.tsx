import React, { useState, useCallback } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { Button } from "~/components/ui/button";
import {
  MdMic,
  MdMicOff,
  MdVolumeUp,
  MdVolumeOff,
  MdFiberManualRecord,
  MdStop,
  MdPlayArrow,
} from "react-icons/md";
import DeviceSelector from "./DeviceSelector";

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface AudioSelectorProps {
  device: Device;
  activeCall: Call | null;
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputDevice: AudioDevice | null;
  selectedOutputDevice: AudioDevice | null;
  setInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  toggleInputMute: () => void;
  toggleOutputMute: () => void;
  isInputMuted: boolean;
  isOutputMuted: boolean;
  testOutputDevice: () => void;
}

const AudioSelector: React.FC<AudioSelectorProps> = ({
  device,
  activeCall,
  inputDevices,
  outputDevices,
  selectedInputDevice,
  selectedOutputDevice,
  setInputDevice,
  setOutputDevice,
  toggleInputMute,
  toggleOutputMute,
  isInputMuted,
  isOutputMuted,
  testOutputDevice,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const startRecording = useCallback(async () => {
    if (!selectedInputDevice) {
      setError("No input device selected");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: selectedInputDevice.deviceId } },
      });

      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        setAudioBlob(audioBlob);
        setIsRecording(false);
      };

      mediaRecorder.start();
      setIsRecording(true);

      setTimeout(() => {
        mediaRecorder.stop();
        stream.getTracks().forEach((track) => track.stop());
      }, 5000);
    } catch (err) {
      console.error("Error starting recording:", err);
      setError("Failed to start recording");
    }
  }, [selectedInputDevice]);

  const playRecording = useCallback(() => {
    if (audioBlob) {
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    }
  }, [audioBlob]);

  const handleTestClick = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
    } else if (audioBlob && !isPlaying) {
      playRecording();
    } else {
      startRecording();
    }
  }, [isRecording, audioBlob, isPlaying, playRecording, startRecording]);

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center space-x-2">
        <DeviceSelector
          devices={inputDevices}
          onDeviceChange={(deviceId) => setInputDevice(deviceId)}
          selectedDeviceId={selectedInputDevice?.deviceId || ""}
        />
        <Button
          variant="outline"
          onClick={toggleInputMute}
          className={`w-[100px] ${
            isInputMuted ? "bg-red-100 text-red-500 hover:bg-red-200" : ""
          }`}
        >
          {isInputMuted ? <MdMicOff /> : <MdMic />}
          {isInputMuted ? "Unmute" : "Mute"}
        </Button>
        <div className="flex sm:w-[125px]">
          <Button
            onClick={handleTestClick}
            disabled={isPlaying}
            className="rounded-r-none"
            variant="outline"
          >
            {isRecording ? <MdStop /> : <MdFiberManualRecord />}
            {isRecording ? "Stop" : "Test"}
          </Button>
          <Button
            onClick={playRecording}
            disabled={!audioBlob || isRecording || isPlaying}
            className="rounded-l-none border-l"
            variant="outline"
          >
            <MdPlayArrow />
          </Button>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <DeviceSelector
          devices={outputDevices}
          onDeviceChange={(deviceId) => setOutputDevice(deviceId)}
          selectedDeviceId={selectedOutputDevice?.deviceId || ""}
        />
        <Button
          variant="outline"
          onClick={toggleOutputMute}
          className={`w-[100px] ${
            isOutputMuted ? "bg-red-100 text-red-500 hover:bg-red-200" : ""
          }`}
        >
          {isOutputMuted ? <MdVolumeOff /> : <MdVolumeUp />}
          {isOutputMuted ? "Unmute" : "Mute"}
        </Button>
        <Button variant="outline" onClick={testOutputDevice}>
          Test Output
        </Button>
      </div>
      {error && <div className="mt-2 text-red-500">{error}</div>}
    </div>
  );
};

export default AudioSelector;