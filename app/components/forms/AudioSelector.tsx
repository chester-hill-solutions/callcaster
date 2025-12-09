import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SelectorProps {
  devices: MediaDeviceInfo[];
  onDeviceChange: (deviceId: string) => void;
  selectedDeviceId: string;
}

const DeviceSelector: React.FC<SelectorProps> = ({ devices, onDeviceChange, selectedDeviceId }) => {
  return (
    <Select onValueChange={onDeviceChange} value={selectedDeviceId || undefined}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select a device" />
      </SelectTrigger>
      <SelectContent>
        {devices.length > 0 ? (
          devices.map((device) => (
            <SelectItem key={device.deviceId} value={device.deviceId || 'default'}>
              {device.label || `Default ${device.kind}`}
            </SelectItem>
          ))
        ) : (
          <SelectItem value="no-devices" disabled>
            No devices available
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
};

export default DeviceSelector;