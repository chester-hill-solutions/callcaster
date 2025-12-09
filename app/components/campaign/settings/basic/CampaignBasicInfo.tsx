import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { Archive, Pause, Play, Calendar, Copy, TimerIcon, Clock, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FetcherWithComponents } from "@remix-run/react";
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
      states.pause = "Inactive";
      states.play = "Active";
      states.schedule = "Disabled";
      states.archive = "Inactive";
      break;
    case "paused":
      states.play = isPlayDisabled ? "Disabled" : "Inactive";
      states.schedule = "Inactive";
      states.archive = "Inactive";
      states.pause = "Active";
      states.schedule = "Inactive";
      break;
    case "draft":
    case "pending":
      states.play = isPlayDisabled ? "Disabled" : "Inactive";
      states.pause = "Inactive";
      states.archive = "Inactive";
      states.schedule = "Disabled";
      break;
    case "scheduled":
      states.play = isPlayDisabled ? "Disabled" : "Inactive";
      states.pause = "Inactive";
      states.archive = "Inactive";
      states.schedule = "Active";
      states.pause = "Inactive";
      break;
    case "complete":
      states.archive = "Inactive";
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
) => {
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
  
  if ('script_id' in details && !details.script_id && 'body_text' in details && !details.body_text) {
    errors.push("Script or message content is required");
  } else if ('script_id' in details && !details.script_id) {
    errors.push("Script is required");
  } else if ('body_text' in details && !details.body_text) {
    errors.push("Message content is required");
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
  flags,
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
                  handleButton(type as "play" | "pause" | "archive" | "schedule");
                }
              }}
              disabled={getButtonStates(campaignData.status as CampaignState, Boolean(isPlayDisabled))[type] === "Disabled"}
              className={`
                ${state === "Active" ? "bg-primary text-primary-foreground shadow-sm" : ""}
                ${state === "Inactive" ? "border-primary" : ""}
                ${isDisabled ? "cursor-not-allowed opacity-50" : ""}
              `}
            >
              {icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent align="center">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="space-y-6">
      {/* Title and Actions Row */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Input
            id="title"
            name="title"
            value={campaignData.title}
            onChange={(e) => handleInputChange("title", e.target.value)}
            className="border-0 bg-transparent px-0 text-lg font-medium h-9 focus-visible:ring-0"
            placeholder="Campaign Title"
          />
        </div>
        <div className="flex items-center gap-1">
          {renderButton(
            "play",
            <Play className="h-4 w-4" />,
            isPlayDisabled || "Start the campaign"
          )}
          {renderButton(
            "schedule",
            <Clock className="h-4 w-4" />,
            "Schedule the campaign"
          )}
          {renderButton(
            "pause",
            <Pause className="h-4 w-4" />,
            "Pause the campaign"
          )}
          {renderButton(
            "duplicate",
            <Copy className="h-4 w-4" />,
            "Duplicate the campaign"
          )}
          {renderButton(
            "archive",
            <Archive className="h-4 w-4" />,
            "Archive the campaign"
          )}
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1">
              Campaign Type
              <span className="text-destructive">*</span>
            </Label>
            <SelectType
              handleInputChange={handleInputChange}
              campaignData={campaignData}
              flags={flags}
            />
            {!campaignData.type && (
              <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Required field
              </p>
            )}
          </div>
          <div>
            <Label className="text-sm font-medium flex items-center gap-1">
              Phone Number
              <span className="text-destructive">*</span>
            </Label>
            <SelectNumber
              handleInputChange={handleInputChange}
              campaignData={campaignData}
              phoneNumbers={phoneNumbers}
            />
            {!campaignData.caller_id && (
              <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Required field
              </p>
            )}
          </div>
        </div>
      </div>
      <div>
        <Label className="text-sm font-medium flex items-center gap-1">
          Schedule
          <span className="text-destructive">*</span>
        </Label>
        <SelectDates
          campaignData={campaignData}
          handleInputChange={handleInputChange}
        />
        {(!campaignData.start_date || !campaignData.end_date || !campaignData.schedule) && (
          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            Start date, end date, and calling hours are required
          </p>
        )}
      </div>
    </div>
  );
};
