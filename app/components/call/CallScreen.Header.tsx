import React from 'react';
import { Button } from "~/components/ui/button";
import {
  Mic,
  MicOff,
  PhoneOff,
  AlertTriangle,
  Headphones,
  Phone,
  Monitor,
  Plus
} from "lucide-react";

interface CampaignHeaderProps {
  campaign: {
    title: string;
  };
  count: number;
  completed: number;
  mediaStream: MediaStream | null;
  availableMicrophones: MediaDeviceInfo[];
  availableSpeakers: MediaDeviceInfo[];
  onLeaveCampaign: () => void;
  onReportError: () => void;
  handleMicrophoneChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  handleSpeakerChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  handleMuteMicrophone: () => void;
  isMicrophoneMuted: boolean;
  availableCredits: number;
  creditState: "GOOD" | "WARNING" | "BAD";
  hasAccess: boolean;
  phoneStatus: 'disconnected' | 'connecting' | 'connected';
  selectedDevice: string;
  onDeviceSelect: (device: string) => void;
  verifiedNumbers: string[];
  isAddingNumber: boolean;
  onAddNumberClick: () => void;
  onAddNumberCancel: () => void;
  newPhoneNumber: string;
  onNewPhoneNumberChange: (value: string) => void;
  onVerifyNewNumber: () => void;
  pin: string;
}

export const CampaignHeader: React.FC<CampaignHeaderProps> = ({
  campaign,
  count,
  completed,
  mediaStream,
  availableMicrophones,
  availableSpeakers,
  onLeaveCampaign,
  onReportError,
  handleMicrophoneChange,
  handleSpeakerChange,
  handleMuteMicrophone,
  isMicrophoneMuted,
  availableCredits,
  creditState,
  hasAccess,
  phoneStatus,
  selectedDevice,
  onDeviceSelect,
  verifiedNumbers,
  isAddingNumber,
  onAddNumberClick,
  onAddNumberCancel,
  newPhoneNumber,
  onNewPhoneNumberChange,
  onVerifyNewNumber,
  pin
}) => {
  console.log(verifiedNumbers)
  return (
    <div className="flex flex-col gap-6 p-6 w-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-Zilla-Slab text-gray-900">{campaign.title}</h1>
          <p className="text-gray-600 mt-1">
            {count - completed} of {count} remaining
          </p>
          {hasAccess && <p className="text-gray-600 mt-1 flex items-center gap-2">
            {availableCredits} credits remaining
            <span className={`px-2 py-0.5 rounded-full text-sm ${creditState === "GOOD" ? "bg-green-100 text-green-800" :
                creditState === "WARNING" ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800"
              }`}>
              {creditState === "GOOD" ? "Healthy" :
                creditState === "WARNING" ? "Running Low" :
                  "Critical"}
            </span>
          </p>}
        </div>
        <div className="flex gap-3">
          <Button
            variant="destructive"
            onClick={onLeaveCampaign}
            className="flex items-center gap-2"
          >
            <PhoneOff size={16} />
            Leave Campaign
          </Button>
          <Button
            variant="outline"
            onClick={onReportError}
            className="flex items-center gap-2"
          >
            <AlertTriangle size={16} />
            Report Issue
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Mic size={16} /> Microphone
          </label>
          <select
            onChange={handleMicrophoneChange}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableMicrophones.map((microphone) => (
              <option
                key={microphone.deviceId}
                value={microphone.deviceId}
                selected={microphone.deviceId === availableMicrophones[0].deviceId}
              >
                {microphone.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Headphones size={16} /> Speaker
          </label>
          <select
            onChange={handleSpeakerChange}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableSpeakers.map((speaker) => (
              <option
                key={speaker.deviceId}
                value={speaker.deviceId}
                selected={speaker.deviceId === availableSpeakers[0].deviceId}
              >
                {speaker.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <Button
            onClick={handleMuteMicrophone}
            variant={isMicrophoneMuted ? "destructive" : "outline"}
            className="w-full flex items-center justify-center gap-2"
          >
            {isMicrophoneMuted ? <MicOff size={16} /> : <Mic size={16} />}
            {isMicrophoneMuted ? "Unmute Microphone" : "Mute Microphone"}
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-4 mt-4">
        <div className="relative inline-block">
          <select
            value={selectedDevice}
            onChange={(e) => onDeviceSelect(e.target.value)}
            className="flex items-center space-x-2 px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 pr-8 appearance-none cursor-pointer"
          >
            <option value="computer" className="flex items-center">
              Computer Audio
            </option>
            {verifiedNumbers.map((number) => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
            {selectedDevice === 'computer' ? <Monitor size={16} /> : <Phone size={16} />}
          </div>
          {phoneStatus === 'connecting' && (
            <span className="ml-2 text-yellow-500">Connecting...</span>
          )}
        </div>

        <Button
          variant="outline"
          onClick={onAddNumberClick}
          className="flex items-center gap-2"
        >
          <Plus size={16} />
          Add Phone Number
        </Button>

        {/* Add Number Dialog */}
        {isAddingNumber && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4">Add Phone Number</h2>
              <p className="text-gray-600 mb-4">
                Enter your phone number to verify it for making calls.
              </p>
              <input
                type="tel"
                value={newPhoneNumber}
                onChange={(e) => onNewPhoneNumberChange(e.target.value)}
                placeholder="+1234567890"
                className="w-full px-3 py-2 border rounded-md mb-4"
              />
              <div className="flex space-x-3">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onVerifyNewNumber();
                  }}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Verify Number
                </button>
                <button
                  onClick={onAddNumberCancel}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {pin &&
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
              <p className="text-gray-600 mb-4">On your phone, enter the PIN: {pin}</p>  
            </div>
          </div>
        }
      </div>
    </div>
  );
};