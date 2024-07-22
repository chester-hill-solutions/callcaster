import React, { useState, useEffect, useCallback, useRef } from "react";
import { Device } from "@twilio/voice-sdk";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { MdMic, MdMicOff, MdFiberManualRecord, MdStop, MdPlayArrow } from "react-icons/md";

interface InputSelectorProps {
  device: Device;
}

const InputSelector: React.FC<InputSelectorProps> = ({ device }) => {
  const [inputDevices, setInputDevices] = useState<Map<string, MediaDeviceInfo>>(new Map());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleDeviceChange = useCallback(() => {
    if (!device?.audio) {
      setError("Audio interface is not available");
      return;
    }

    const availableDevices = device.audio.availableInputDevices;

    if (!availableDevices) {
      setError("No input devices available");
      return;
    }

    setInputDevices(availableDevices);

    if (!selectedDeviceId && availableDevices.size > 0) {
      const firstDevice = Array.from(availableDevices.keys())[0];
      setSelectedDeviceId(firstDevice);
    }
  }, [device, selectedDeviceId]);

  useEffect(() => {
    if (!device) {
      setError("Device is undefined");
      return;
    }

    device.audio?.on("deviceChange", handleDeviceChange);

    handleDeviceChange();

    return () => {
      device.audio?.off("deviceChange", handleDeviceChange);
    };
  }, [device, handleDeviceChange]);

  const handleDeviceSelection = async (deviceId: string) => {
    try {
      await device?.audio?.setInputDevice(deviceId);
      setSelectedDeviceId(deviceId);
      setError(null);
    } catch (error) {
      console.error("Failed to set input device:", error);
      setError(`Failed to set input device: ${error.message}`);
    }
  };

  const toggleMute = () => {
    if (device?.audio) {
      const newMuteState = !isMuted;
      device.audio.outgoing(newMuteState);
      setIsMuted(newMuteState);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
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

  const deviceEntries = Array.from(inputDevices.entries());

  return (
    <div className="space-y-4 rounded-lg bg-white">
      {error && (
        <div className="rounded bg-red-100 p-2 text-red-500">{error}</div>
      )}
      <div className="flex items-center space-x-2">
        <Select onValueChange={handleDeviceSelection} value={selectedDeviceId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select a microphone" />
          </SelectTrigger>
          <SelectContent>
            {deviceEntries.length > 0 ? (
              deviceEntries.map(([id, info]) => (
                <SelectItem key={id} value={id}>
                  {info?.label || `Device ${id.slice(0, 5)}...`}
                </SelectItem>
              ))
            ) : (
              <SelectItem value={null} disabled>
                No input devices available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <div className="flex" style={{width:"125px"}}>
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
          className={`flex gap-1 w-[125px] transition-colors ${isMuted ? "bg-red-100 hover:bg-red-200 text-red-500" : ""}`}
          >
          {isMuted ? <><MdMicOff className="text-red-500" />MUTED</>: <><MdMic />MUTE</>}
        </Button>
      </div>
    </div>
  );
};

export default InputSelector;