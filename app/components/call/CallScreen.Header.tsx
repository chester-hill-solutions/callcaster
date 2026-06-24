import React from "react";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  Mic,
  MicOff,
  PhoneOff,
  AlertTriangle,
  Headphones,
  Phone,
  Monitor,
  Plus,
} from "lucide-react";

interface CampaignHeaderProps {
  className?: string;
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
  phoneStatus: "disconnected" | "connecting" | "connected";
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

const creditBadgeClass: Record<CampaignHeaderProps["creditState"], string> = {
  GOOD: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  WARNING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
  BAD: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

const creditLabel: Record<CampaignHeaderProps["creditState"], string> = {
  GOOD: "Healthy",
  WARNING: "Running Low",
  BAD: "Critical",
};

const deviceSelectClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export const CampaignHeader: React.FC<CampaignHeaderProps> = ({
  className,
  campaign,
  count,
  completed,
  mediaStream: _mediaStream,
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
  pin,
}) => {
  const microphoneSelectId = "campaign-microphone-select";
  const speakerSelectId = "campaign-speaker-select";
  const defaultMicrophoneId = availableMicrophones[0]?.deviceId ?? "";
  const defaultSpeakerId = availableSpeakers[0]?.deviceId ?? "";

  return (
    <div className={cn("flex w-full flex-col gap-4 p-4", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Heading as="h1" level={2} branded={false}>
            {campaign.title}
          </Heading>
          <Text variant="muted" className="mt-1">
            {count - completed} of {count} remaining
          </Text>
          {hasAccess ? (
            <Text variant="muted" className="mt-1 flex flex-wrap items-center gap-2">
              {availableCredits} credits remaining
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-sm font-medium",
                  creditBadgeClass[creditState],
                )}
              >
                {creditLabel[creditState]}
              </span>
            </Text>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
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

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="devices" className="border-border/60">
          <AccordionTrigger className="py-2 text-sm font-medium hover:no-underline">
            Audio & phone settings
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor={microphoneSelectId}
                  className="flex items-center gap-2 text-sm font-medium text-foreground"
                >
                  <Mic size={16} /> Microphone
                </label>
                <select
                  id={microphoneSelectId}
                  defaultValue={defaultMicrophoneId}
                  onChange={handleMicrophoneChange}
                  className={deviceSelectClass}
                >
                  {availableMicrophones.map((microphone) => (
                    <option key={microphone.deviceId} value={microphone.deviceId}>
                      {microphone.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor={speakerSelectId}
                  className="flex items-center gap-2 text-sm font-medium text-foreground"
                >
                  <Headphones size={16} /> Speaker
                </label>
                <select
                  id={speakerSelectId}
                  defaultValue={defaultSpeakerId}
                  onChange={handleSpeakerChange}
                  className={deviceSelectClass}
                >
                  {availableSpeakers.map((speaker) => (
                    <option key={speaker.deviceId} value={speaker.deviceId}>
                      {speaker.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <Button
                  onClick={handleMuteMicrophone}
                  variant={isMicrophoneMuted ? "destructive" : "outline"}
                  className="flex w-full items-center justify-center gap-2"
                >
                  {isMicrophoneMuted ? <MicOff size={16} /> : <Mic size={16} />}
                  {isMicrophoneMuted ? "Unmute Microphone" : "Mute Microphone"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="relative inline-block">
                <select
                  value={selectedDevice}
                  onChange={(e) => onDeviceSelect(e.target.value)}
                  className={cn(deviceSelectClass, "cursor-pointer pr-8")}
                >
                  <option value="computer">Computer Audio</option>
                  {verifiedNumbers.map((number) => (
                    <option key={number} value={number}>
                      {number}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2">
                  {selectedDevice === "computer" ? (
                    <Monitor size={16} />
                  ) : (
                    <Phone size={16} />
                  )}
                </div>
                {phoneStatus === "connecting" ? (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    Connecting...
                  </span>
                ) : null}
              </div>

              <Button
                variant="outline"
                onClick={onAddNumberClick}
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                Add Phone Number
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {isAddingNumber ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-md">
              <Heading level={3} branded={false} className="mb-4">
                Add Phone Number
              </Heading>
              <Text variant="muted" className="mb-4">
                Enter your phone number to verify it for making calls.
              </Text>
              <input
                type="tel"
                value={newPhoneNumber}
                onChange={(e) => onNewPhoneNumberChange(e.target.value)}
                placeholder="+1234567890"
                className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
              <div className="flex gap-3">
                <Button type="button" className="flex-1" onClick={onVerifyNewNumber}>
                  Verify Number
                </Button>
                <Button type="button" variant="outline" onClick={onAddNumberCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      {pin ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-md">
              <Text variant="muted">On your phone, enter the PIN: {pin}</Text>
            </div>
          </div>
        ) : null}
    </div>
  );
};
