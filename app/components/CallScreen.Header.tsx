import React from 'react';
import { Button } from "~/components/ui/button";
import { Mic, MicOff, PhoneOff, AlertTriangle, Headphones } from "lucide-react";

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
  creditState: "GOOD" |"WARNING" |"BAD";
  hasAccess: boolean;
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
}) => {
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
            <span className={`px-2 py-0.5 rounded-full text-sm ${
              creditState === "GOOD" ? "bg-green-100 text-green-800" :
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
    </div>
  );
};