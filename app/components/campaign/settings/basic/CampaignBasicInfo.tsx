import { Button } from "@/components/ui/button";

import { Archive, Pause, Play, Calendar, Copy, TimerIcon, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Campaign, Flags, WorkspaceNumbers } from "@/lib/types";
import SelectType from "./CampaignBasicInfo.SelectType";
import SelectNumber from "./CampaignBasicInfo.SelectNumber";
import SelectDates from "./CampaignBasicInfo.Dates";

// Types
type ButtonState = "Active" | "Inactive" | "Disabled";

type CampaignState =
  | "running"
  | "paused"
  | "archived"
  | "draft"
  | "pending"
  | "scheduled"
  | "complete";

// Helper Functions
const getButtonStates = (
  campaignState: CampaignState,
  isPlayDisabled: string | boolean,
): Record<string, ButtonState> => {
  const states: Record<string, ButtonState> = {
    play: "Disabled",
    pause: "Disabled",
    archive: "Disabled",
    schedule: "Disabled",
  };

  switch (campaignState) {
    case "running":
      states["pause"] = "Inactive";
      states["play"] = "Active";
      states["schedule"] = "Disabled";
      states["archive"] = "Inactive";
      break;
    case "paused":
      states["play"] = isPlayDisabled ? "Disabled" : "Inactive";
      states["schedule"] = "Inactive";
      states["archive"] = "Inactive";
      states["pause"] = "Active";
      states["schedule"] = "Inactive";
      break;
    case "draft":
    case "pending":
      states["play"] = isPlayDisabled ? "Disabled" : "Inactive";
      states["pause"] = "Inactive";
      states["archive"] = "Inactive";
      states["schedule"] = "Disabled";
      break;
    case "scheduled":
      states["play"] = isPlayDisabled ? "Disabled" : "Inactive";
      states["pause"] = "Inactive";
      states["archive"] = "Inactive";
      states["schedule"] = "Active";
      break;
    case "complete":
      states["archive"] = "Inactive";
      break;
    case "archived":
      break;
  }

  return states;
};

// Component Props Interface
interface CampaignBasicInfoProps {
  campaignData: Campaign;
  handleInputChange: (name: string, value: string | number | null) => void;
  phoneNumbers: WorkspaceNumbers[];
  flags: Flags;

  handleButton: (type: "play" | "pause" | "archive" | "schedule") => void;
  handleConfirmStatus: (status: "play" | "archive" | "none") => void;
  handleDuplicateButton: () => void;
  startDisabledReason: string | null;
  readinessIssues: string[];
  scheduleDisabled: string | boolean;
  isBusy: boolean;
  callerIdOptional?: boolean;
}

// Main Component
export const CampaignBasicInfo = ({
  campaignData,
  handleInputChange,
  phoneNumbers,
  flags: _flags,
  handleButton,
  handleConfirmStatus,
  handleDuplicateButton,
  startDisabledReason,
  readinessIssues,
  scheduleDisabled,
  isBusy,
  callerIdOptional = false,
}: CampaignBasicInfoProps) => {
  const buttonStates = getButtonStates(
    campaignData.status as CampaignState,
    !!startDisabledReason,
  );

  // Button renderer
  const renderButton = (
    type: "play" | "pause" | "archive" | "duplicate" | "schedule",
    icon: React.ReactNode,
    tooltip: string,
  ) => {
    const state = buttonStates[type];

    const isDisabled = type === "schedule" ? scheduleDisabled : state === "Disabled";
    const tooltipText = type === "schedule"
      ? (scheduleDisabled || tooltip)
      : type === "play" && startDisabledReason
        ? startDisabledReason
        : state === "Active"
          ? `Currently ${type === "play" ? "running" : `${type}ed`}`
          : tooltip;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={state === "Active" ? "default" : "outline"}
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                if (type === "duplicate") {
                  handleDuplicateButton();
                } else if (type === "play" || type === "archive") {
                  handleConfirmStatus(type);
                } else {
                  handleButton(type);
                }
              }}
              disabled={!!isDisabled || isBusy}
            >
              {icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <SelectType
            campaignData={campaignData}
            handleInputChange={(name, value) =>
              handleInputChange(name, typeof value === "boolean" ? (value ? 1 : 0) : value as string | number | null)
            }
          />

          {campaignData.type === "message" && callerIdOptional ? (
            <p className="-mt-1 text-xs text-muted-foreground">
              Outbound number is optional when sending via Messaging Service (Twilio uses the
              service&apos;s sender pool).
            </p>
          ) : null}
          <SelectNumber
            campaignData={{ caller_id: campaignData.caller_id ?? undefined }}
            handleInputChange={(name, value) => handleInputChange(name, value)}
            phoneNumbers={phoneNumbers}
            callerIdOptional={callerIdOptional}
          />

          <SelectDates
            campaignData={campaignData}
            handleInputChange={handleInputChange}
          />

        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <TimerIcon className="h-4 w-4" />
            <span className="text-sm font-medium">Campaign Controls</span>
          </div>

          <div className="flex space-x-2">
            {renderButton("play", <Play className="h-4 w-4" />, "Start campaign")}
            {renderButton("pause", <Pause className="h-4 w-4" />, "Pause campaign")}
            {renderButton("archive", <Archive className="h-4 w-4" />, "Archive campaign")}
            {renderButton("schedule", <Calendar className="h-4 w-4" />, "Schedule campaign")}
            {renderButton("duplicate", <Copy className="h-4 w-4" />, "Duplicate campaign")}
          </div>

          {readinessIssues.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="mb-2 flex items-center space-x-2">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Campaign needs attention before it can start</span>
              </div>
              <ul className="list-disc space-y-1 pl-5">
                {readinessIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
