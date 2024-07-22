import React, { useState, useEffect } from 'react';
import { Device } from '@twilio/voice-sdk';
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Command, CommandGroup, CommandItem } from "~/components/ui/command";
import { MdMic } from "react-icons/md";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@radix-ui/react-select';

interface InputVolumeMeterProps {
  device: Device;
}

const InputVolumeMeter: React.FC<InputVolumeMeterProps> = ({ device }) => {
  const [volume, setVolume] = useState<number>(0);
  const [inputDevices, setInputDevices] = useState<Map<string, MediaDeviceInfo>>(new Map());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!device) {
      console.error("Device is undefined");
      setError("Device is undefined");
      return;
    }

    const handleInputVolume = (inputVolume: number) => {
      setVolume(inputVolume);
    };

    const handleDeviceChange = () => {
      console.log("Device change event triggered");
      if (!device.audio) {
        console.error("device.audio is undefined");
        setError("Audio interface is not available");
        return;
      }

      const availableDevices = device.audio.availableInputDevices;
      console.log("Available devices:", availableDevices);

      if (!availableDevices) {
        console.error("availableInputDevices is undefined");
        setError("No input devices available");
        return;
      }

      setInputDevices(availableDevices);
      
      if (!selectedDeviceId && availableDevices.size > 0) {
        const firstDevice = Array.from(availableDevices.keys())[0];
        setSelectedDeviceId(firstDevice);
      }
    };

    device.audio?.on('inputVolume', handleInputVolume);
    device.audio?.on('deviceChange', handleDeviceChange);

    // Initial device setup
    handleDeviceChange();

    return () => {
      device.audio?.off('inputVolume', handleInputVolume);
      device.audio?.off('deviceChange', handleDeviceChange);
    };
  }, [device, selectedDeviceId]);

  const handleDeviceChange = async (deviceId: string) => {
    try {
      await device?.audio?.setInputDevice(deviceId);
      setSelectedDeviceId(deviceId);
    } catch (error) {
      console.error('Failed to set input device:', error);
      setError(`Failed to set input device: ${error?.message}`);
    }
  };

  const getVolumeColor = () => {
    if (volume < 0.3) return 'bg-green-500';
    if (volume < 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const deviceEntries = Array.from(inputDevices.entries());
  console
  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  return (
    <div className="flex items-center space-x-4">
      <div className="flex flex-col items-center">
        <div className="w-4 h-32 bg-gray-200 rounded-full overflow-hidden relative">
          <div 
            className={`w-full ${getVolumeColor()} transition-all duration-100 absolute bottom-0`}
            style={{ height: `${volume * 100}%` }}
          ></div>
        </div>
      </div>
      <div className="flex flex-col items-start space-y-2">
        <span className="text-xs text-gray-500 truncate max-w-[150px]">
          {inputDevices.get(selectedDeviceId)?.label || 'No device selected'}
        </span>
        <Select onValueChange={handleDeviceChange} value={selectedDeviceId}>
        <SelectTrigger>
        <Button variant="outline" size="icon">
              <MdMic />
            </Button>
          </SelectTrigger>
            <SelectContent>
                {deviceEntries?.length > 0 ? (
                  deviceEntries?.map(([id, info]) => (
                    <SelectItem key={id} value={id}>
                      {info?.label || `Device ${id.slice(0, 5)}...`}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={null}>No input devices available</SelectItem>
                )}
            </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default InputVolumeMeter;