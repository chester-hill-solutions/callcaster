import React from 'react';
import { Button } from "~/components/ui/button";

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
  handleMuteSpeaker: () => void;
  isMicrophoneMuted: boolean;
  isSpeakerMuted: boolean;
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
  handleMuteSpeaker,
  isMicrophoneMuted,
  isSpeakerMuted,
}) => {
  return (
    <div className="flex flex-wrap justify-between px-4">
      <div className="flex flex-col justify-between gap-2 py-4">
        <div className="flex flex-col max-w-[400px] justify-between gap-2 sm:flex-nowrap">
          <div className="px-1 font-Zilla-Slab">
            <h1 className="text-3xl">{campaign.title}</h1>
            <h4>
              {count - completed} of {count} remaining
            </h4>
          </div>
          <div className="flex gap-2">
            <Button onClick={onLeaveCampaign}>
              Leave Campaign
            </Button>
            <Button variant="outline" onClick={onReportError}>
              Report Error
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <select onChange={handleMicrophoneChange}>
            {availableMicrophones.map((microphone) => (
              <option key={microphone.deviceId} value={microphone.deviceId} selected={microphone.deviceId === availableMicrophones[0].deviceId}>
                {microphone.label}
              </option>
            ))}  
          </select>
        </div>
        <div className="flex gap-2">
          <select onChange={handleSpeakerChange}>
            {availableSpeakers.map((speaker) => (
              <option key={speaker.deviceId} value={speaker.deviceId} selected={speaker.deviceId === availableSpeakers[0].deviceId}>
                {speaker.label}
              </option>
            ))}
          </select>
          </div>
        <div className="flex gap-2">
          <Button onClick={handleMuteMicrophone}>
            {isMicrophoneMuted ? "Unmute Microphone" : "Mute Microphone"}
          </Button> 
        </div>
        <div className="flex gap-2">
          <Button onClick={handleMuteSpeaker}>
            {isSpeakerMuted ? "Unmute Speaker" : "Mute Speaker"}
          </Button>
        </div>
      </div>
    </div>
  );
};