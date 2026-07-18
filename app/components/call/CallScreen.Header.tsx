import React from "react";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AUDIO_DEVICE_UNAVAILABLE_VALUE } from "@/hooks/call/audio-device-selection";
import {
  Mic,
  MicOff,
  PhoneOff,
  AlertTriangle,
  Headphones,
  Phone,
  Monitor,
  Plus,
  MoreHorizontal,
} from "lucide-react";
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

const deviceSelectClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

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
}) => {
  const microphoneSelectId = "campaign-microphone-select";
  const speakerSelectId = "campaign-speaker-select";

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
          <AccordionContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField
                htmlFor={microphoneSelectId}
                label={
                  <span className="flex items-center gap-2">
                    <Mic size={16} /> Microphone
                  </span>
                }
              >
                <Select
                  value={selectedMicrophone ?? AUDIO_DEVICE_UNAVAILABLE_VALUE}
                  onValueChange={(value) =>
                    handleMicrophoneChange({
                      target: { value },
                    } as React.ChangeEvent<HTMLSelectElement>)
                  }
                >
                  <SelectTrigger
                    id={microphoneSelectId}
                    className={deviceSelectClass}
                  >
                    <SelectValue placeholder="Select microphone" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMicrophones.map((microphone) => (
                      <SelectItem
                        key={microphone.deviceId}
                        value={microphone.deviceId}
                      >
                        {microphone.label}
                      </SelectItem>
                    ))}
                    {availableMicrophones.length === 0 ? (
                      <SelectItem
                        value={AUDIO_DEVICE_UNAVAILABLE_VALUE}
                        disabled
                      >
                        Microphone unavailable
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField
                htmlFor={speakerSelectId}
                label={
                  <span className="flex items-center gap-2">
                    <Headphones size={16} /> Speaker
                  </span>
                }
              >
                <Select
                  value={selectedSpeaker ?? AUDIO_DEVICE_UNAVAILABLE_VALUE}
                  onValueChange={(value) =>
                    handleSpeakerChange({
                      target: { value },
                    } as React.ChangeEvent<HTMLSelectElement>)
                  }
                >
                  <SelectTrigger
                    id={speakerSelectId}
                    className={deviceSelectClass}
                  >
                    <SelectValue placeholder="Select speaker" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSpeakers.map((speaker) => (
                      <SelectItem
                        key={speaker.deviceId}
                        value={speaker.deviceId}
                      >
                        {speaker.label}
                      </SelectItem>
                    ))}
                    {availableSpeakers.length === 0 ? (
                      <SelectItem
                        value={AUDIO_DEVICE_UNAVAILABLE_VALUE}
                        disabled
                      >
                        Speaker unavailable
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </FormField>

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
                <Select value={selectedDevice} onValueChange={onDeviceSelect}>
                  <SelectTrigger
                    className={cn(deviceSelectClass, "cursor-pointer pr-8")}
                  >
                    <SelectValue placeholder="Select device" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="computer">Computer Audio</SelectItem>
                    {verifiedNumbers.map((number) => (
                      <SelectItem key={number} value={number}>
                        {number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2">
                  {selectedDevice === "computer" ? (
                    <Monitor size={16} />
                  ) : (
                    <Phone size={16} />
                  )}
                </div>
                {phoneStatus === "connecting" ? (
                  <span className="ml-2 text-warning">Connecting...</span>
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
        <Dialog
          open={isAddingNumber}
          onOpenChange={(open) => {
            if (!open) onAddNumberCancel();
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Phone Number</DialogTitle>
              <DialogDescription>
                Enter your phone number to verify it for making calls.
              </DialogDescription>
            </DialogHeader>
            <input
              type="tel"
              value={newPhoneNumber}
              onChange={(e) => onNewPhoneNumberChange(e.target.value)}
              placeholder="+1234567890"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            />
            <DialogFooter>
              <Button
                type="button"
                className="flex-1"
                onClick={onVerifyNewNumber}
              >
                Verify Number
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onAddNumberCancel}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {verificationPhoneNumber ? (
        <Dialog open={Boolean(verificationPhoneNumber)}>
          <DialogContent className="max-w-md">
            <DialogTitle>Verify by calling in</DialogTitle>
            <DialogDescription>
              Call {verificationPhoneNumber} from {newPhoneNumber} within 10
              minutes. Your number will be verified when the call connects.
            </DialogDescription>
          </DialogContent>
        </Dialog>
      ) : null}
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
                className="text-destructive focus:text-destructive"
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
