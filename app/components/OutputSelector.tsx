import React, { useState, useEffect, useCallback } from "react";
import { Device } from "@twilio/voice-sdk";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Volume, Volume2 } from "lucide-react";
import { MdVolumeMute, MdVolumeOff, MdVolumeUp } from "react-icons/md";

interface OutputSelectorProps {
  device: Device;
}

const OutputSelector: React.FC<OutputSelectorProps> = ({ device }) => {
  const [outputDevices, setOutputDevices] = useState<Map<string, MediaDeviceInfo>>(new Map());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false)
  
  const handleDeviceChange = useCallback(() => {
    if (!device?.audio) {
      setError("Audio interface is not available");
      return;
    }
    const availableDevices = device.audio.availableOutputDevices;

    if (!availableDevices) {
      setError("No output devices available");
      return;
    }

    setOutputDevices(availableDevices);
    if (!selectedDeviceId) {
      const speakerDevices = device.audio.speakerDevices.get();
      if (speakerDevices.size > 0) {
        setSelectedDeviceId(Array.from(speakerDevices)[0].deviceId);
      }
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
      await device?.audio?.speakerDevices.set(deviceId);
      await device?.audio?.ringtoneDevices.set(deviceId);
      setSelectedDeviceId(deviceId);
      setError(null);
    } catch (error) {
      console.error("Failed to set output device:", error);
      setError(`Failed to set output device: ${error.message}`);
    }
  };

  const toggleMute = () => {
    if (device?.audio) {
      const newMuteState = !isMuted;
      device.audio.incoming(newMuteState);
      setIsMuted(newMuteState);
    }
  };

  const testDevice = () => {
    device.audio?.speakerDevices?.test()
  }

  const deviceEntries = Array.from(outputDevices.entries());

  return (
    <div className="space-y-4 rounded-lg bg-white">
      {error && (
        <div className="rounded bg-red-100 p-2 text-red-500">{error}</div>
      )}
        <div className="flex items-center space-x-2">
          <Select onValueChange={handleDeviceSelection} value={selectedDeviceId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select output device" />
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
                  No output devices available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button variant={'outline'} className="w-[125px]" onClick={testDevice}>Test Output</Button>
          <Button
            variant="outline"
            onClick={toggleMute}
            title="Test output device"
            className={`flex gap-1 w-[125px] transition-colors ${isMuted ? "bg-red-100 hover:bg-red-200 text-red-500" : ""}`}
          >
           
            {isMuted ? <><MdVolumeOff /> MUTED</> : <><MdVolumeUp/> MUTE</>}
          </Button>
        </div>
      </div>
  );
};

export default OutputSelector;