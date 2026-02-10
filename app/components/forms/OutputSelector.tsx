import React, { useState, useEffect, useCallback } from "react";
import { Device } from "@twilio/voice-sdk";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger.client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MdVolumeOff, MdVolumeUp } from "react-icons/md";
import DeviceSelector from "./AudioSelector";

interface OutputSelectorProps {
  device: Device;
}

const OutputSelector: React.FC<OutputSelectorProps> = ({ device }) => {
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
    const availableDevices = device.audio.availableOutputDevices;
    if (!availableDevices || availableDevices.size === 0) {
      setError("No output devices available");
      setIsLoading(false);
      return;
    }
    const deviceArray = Array.from(availableDevices.values());
    setOutputDevices(deviceArray);

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

  const initializeDevices = useCallback(() => {
    let retryCount = 0;
    const maxRetries = 5;
    const retryInterval = 1000;

    const tryInitialize = () => {
      if (device?.audio?.availableOutputDevices?.size > 0) {
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
      device.audio.incoming(newMuteState);
      setIsMuted(newMuteState);
    }
  };

  const testDevice = () => {
    if (device?.audio?.speakerDevices) {
      device.audio.speakerDevices.test();
      logger.debug("Testing device:", selectedDeviceId);
    } else {
      logger.error("Speaker devices not available for testing");
    }
  };

  if (isLoading) {
    return <div>Loading audio devices...</div>;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <DeviceSelector
        devices={outputDevices}
        onDeviceChange={setSelectedDeviceId}
        selectedDeviceId={selectedDeviceId}
      />
      <div className="flex flex-1 gap-2 sm:w-[125px]">
        <Button variant={"outline"} className="w-[125px]" onClick={testDevice}>
          Test Output
        </Button>
        <Button
          variant="outline"
          onClick={toggleMute}
          title="Test output device"
          className={`flex w-[125px] gap-1 transition-colors ${isMuted ? "bg-red-100 text-red-500 hover:bg-red-200" : ""}`}
        >
          {isMuted ? (
            <>
              <MdVolumeOff /> MUTED
            </>
          ) : (
            <>
              <MdVolumeUp /> MUTE
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default OutputSelector;
