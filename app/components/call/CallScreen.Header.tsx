import React from "react";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DeviceSettingsPanel } from "@/components/call/CallScreen.DeviceSettings";
import { cn } from "@/lib/utils";
import { PhoneOff, AlertTriangle, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CampaignHeaderProps {
  className?: string;
  settingsOnly?: boolean;
  campaign: {
    title: string;
  };
  count: number;
  completed: number;
  mediaStream: MediaStream | null;
  availableMicrophones: MediaDeviceInfo[];
  availableSpeakers: MediaDeviceInfo[];
  selectedMicrophone: string | null;
  selectedSpeaker: string | null;
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
  verificationPhoneNumber: string;
  // #1339: audio device test controls. Optional so route-level renders
  // that don't wire them (e.g. legacy Storybook or partial mocks) still
  // work — the buttons simply hide when the callbacks aren't provided.
  onTestSpeaker?: () => void;
  onToggleMicMonitor?: () => void;
  micLevel?: number;
  isMicMonitoring?: boolean;
  isSpeakerPlaying?: boolean;
  audioTestError?: string | null;
}

const creditBadgeClass: Record<CampaignHeaderProps["creditState"], string> = {
  GOOD: "bg-success text-success-foreground",
  WARNING: "bg-warning text-warning-foreground",
  BAD: "bg-destructive text-destructive-foreground",
};

const creditLabel: Record<CampaignHeaderProps["creditState"], string> = {
  GOOD: "Healthy",
  WARNING: "Running Low",
  BAD: "Critical",
};

export const CampaignHeader: React.FC<CampaignHeaderProps> = ({
  className,
  settingsOnly = false,
  campaign,
  count,
  completed,
  mediaStream: _mediaStream,
  availableMicrophones,
  availableSpeakers,
  selectedMicrophone,
  selectedSpeaker,
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
  verificationPhoneNumber,
  onTestSpeaker,
  onToggleMicMonitor,
  micLevel = 0,
  isMicMonitoring = false,
  isSpeakerPlaying = false,
  audioTestError = null,
}) => {
  return (
    <div className={cn("flex w-full flex-col gap-4 p-4", className)}>
      {!settingsOnly ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Heading as="h1" level={2} branded={false}>
              {campaign.title}
            </Heading>
            <Text variant="muted" className="mt-1">
              {count - completed} of {count} remaining
            </Text>
            {hasAccess ? (
              <Text
                variant="muted"
                className="mt-1 flex flex-wrap items-center gap-2"
              >
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
      ) : null}

      <Accordion
        type="single"
        collapsible
        defaultValue={settingsOnly ? "devices" : undefined}
        className="w-full"
      >
        <AccordionItem value="devices" className="border-border/60">
          <AccordionTrigger
            className={cn(
              "py-2 text-sm font-medium hover:no-underline",
              settingsOnly && "sr-only",
            )}
          >
            Audio & phone settings
          </AccordionTrigger>
          <AccordionContent>
            <DeviceSettingsPanel
              availableMicrophones={availableMicrophones}
              selectedMicrophone={selectedMicrophone}
              handleMicrophoneChange={handleMicrophoneChange}
              handleMuteMicrophone={handleMuteMicrophone}
              isMicrophoneMuted={isMicrophoneMuted}
              onToggleMicMonitor={onToggleMicMonitor}
              micLevel={micLevel}
              isMicMonitoring={isMicMonitoring}
              availableSpeakers={availableSpeakers}
              selectedSpeaker={selectedSpeaker}
              handleSpeakerChange={handleSpeakerChange}
              onTestSpeaker={onTestSpeaker}
              isSpeakerPlaying={isSpeakerPlaying}
              audioTestError={audioTestError}
              phoneStatus={phoneStatus}
              selectedDevice={selectedDevice}
              onDeviceSelect={onDeviceSelect}
              verifiedNumbers={verifiedNumbers}
              isAddingNumber={isAddingNumber}
              onAddNumberClick={onAddNumberClick}
              onAddNumberCancel={onAddNumberCancel}
              newPhoneNumber={newPhoneNumber}
              onNewPhoneNumberChange={onNewPhoneNumberChange}
              onVerifyNewNumber={onVerifyNewNumber}
              verificationPhoneNumber={verificationPhoneNumber}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

interface TopChromeProps {
  campaign: { title: string };
  count: number;
  completed: number;
  availableCredits: number;
  creditState: CampaignHeaderProps["creditState"];
  hasAccess: boolean;
  predictive: boolean;
  onLeaveCampaign: () => void;
  onReportError: () => void;
  children?: React.ReactNode;
}

export function TopChrome({
  campaign,
  count,
  completed,
  availableCredits,
  creditState,
  hasAccess,
  predictive,
  onLeaveCampaign,
  onReportError,
  children,
}: TopChromeProps) {
  return (
    <header className="sticky top-0 z-20 rounded-xl border bg-background/95 px-3 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Heading as="h1" level={3} branded={false} className="truncate">
            {campaign.title}
          </Heading>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {count - completed} of {count} remaining
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
              {predictive ? "Power dialing" : "Manual dialing"}
            </span>
            {hasAccess ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium",
                  creditBadgeClass[creditState],
                )}
              >
                {availableCredits} credits
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {children}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Campaign actions"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onReportError}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Report Issue
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onLeaveCampaign}
                className="text-destructive-text focus:text-destructive-text"
              >
                <PhoneOff className="mr-2 h-4 w-4" />
                Leave Campaign
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
