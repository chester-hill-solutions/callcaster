import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { Archive, Pause, Play, Calendar, Copy, TimerIcon, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Campaign,
  Flags,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Script,
  WorkspaceNumbers,
} from "@/lib/types";
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

// Validation helper
const validateRequiredFields = (
  campaignData: Campaign,
  details: ((LiveCampaign | IVRCampaign) & { script: Script }) | MessageCampaign
): string[] => {
  const errors: string[] = [];
  
  if (!campaignData.type) {
    errors.push("Campaign type is required");
  }
  
  if (!campaignData.caller_id) {
    errors.push("Phone number is required");
  }
  
  if (!campaignData.start_date || !campaignData.end_date) {
    errors.push("Start and end dates are required");
  }
  
  if (!campaignData.schedule) {
    errors.push("Calling hours are required");
  }

  if (details) {
    if ('script_id' in details && !details.script_id && 'body_text' in details && !details.body_text) {
      errors.push("Script or message content is required");
    } else if ('script_id' in details && !details.script_id) {
      errors.push("Script is required");
    } else if ('body_text' in details && !details.body_text) {
      errors.push("Message content is required");
    }
  }

  return errors;
};

// Component Props Interface
interface CampaignBasicInfoProps {
  campaignData: Campaign;
  handleInputChange: (name: string, value: string | number | null) => void;
  phoneNumbers: WorkspaceNumbers[];
  flags: Flags;

  handleButton: (type: "play" | "pause" | "archive" | "schedule") => void;
  handleConfirmStatus: (status: "queue" | "play" | "archive" | "none") => void;
  handleDuplicateButton: () => void;
  joinDisabled: string | null;
  details: ((LiveCampaign | IVRCampaign) & { script: Script }) | MessageCampaign;

  scheduleDisabled: string | boolean;
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
  details,
  scheduleDisabled,
}: CampaignBasicInfoProps) => {
  const validationErrors = validateRequiredFields(campaignData, details);
  const isPlayDisabled = validationErrors.length > 0 ? validationErrors.join(", ") : null;

  const buttonStates = getButtonStates(
    campaignData.status as CampaignState,
    !!isPlayDisabled,
  );

  // Button renderer
  const renderButton = (
    type: "play" | "pause" | "archive" | "duplicate" | "schedule",
    icon: React.ReactNode,
    tooltip: string,
  ) => {
    const state = buttonStates[type];

    const isDisabled = type === "schedule" ? scheduleDisabled : state === "Disabled";
    const tooltipText = type === "schedule" ? (scheduleDisabled || tooltip) :
      (state === "Active" ? `Currently ${type === "play" ? "running" : `${type}ed`}` :
        tooltip);
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
                } else if (type === "play" || type === "schedule" || type === "archive") {
                  handleConfirmStatus(type === "schedule" ? "queue" : type);
                } else {
                  handleButton(type);
                }
              }}
              disabled={!!isDisabled}
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

          <SelectNumber
            campaignData={{ caller_id: campaignData.caller_id ?? undefined }}
            handleInputChange={(name, value) => handleInputChange(name, value)}
            phoneNumbers={phoneNumbers}
          />

          <SelectDates
            campaignData={campaignData}
            handleInputChange={handleInputChange}
          />

          <div className="space-y-2">
            <Label htmlFor="schedule">Calling Hours</Label>
            <Input
              id="schedule"
              type="text"
              placeholder="9:00 AM - 5:00 PM"
              value={typeof campaignData.schedule === "string" ? campaignData.schedule : ""}
              onChange={(e) => handleInputChange("schedule", e.target.value)}
            />
          </div>
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

          {isPlayDisabled && (
            <div className="flex items-center space-x-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{isPlayDisabled}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
