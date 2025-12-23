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
import { isObject, isString } from "../lib/type-utils";

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

interface CampaignData {
  type?: string;
  caller_id?: string;
  start_date?: string;
  end_date?: string;
  schedule?: string;
  status?: CampaignState;
  [key: string]: unknown;
}

interface CampaignDetails {
  script_id?: string;
  body_text?: string;
  [key: string]: unknown;
}

// Type guard for campaign data
function isCampaignData(data: unknown): data is CampaignData {
  if (!isObject(data)) return false;
  return true; // CampaignData is flexible, just needs to be an object
}

// Type guard for campaign details
function isCampaignDetails(data: unknown): data is CampaignDetails {
  if (!isObject(data)) return false;
  return true; // CampaignDetails is flexible, just needs to be an object
}

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
<<<<<<< HEAD:app/components/campaign/settings/basic/CampaignBasicInfo.tsx
const validateRequiredFields = (
  campaignData: Campaign,
  details: ((LiveCampaign | IVRCampaign) & { script: Script }) | MessageCampaign
) => {
=======
const validateRequiredFields = (campaignData: unknown, details: unknown): string[] => {
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/CampaignBasicInfo.tsx
  const errors: string[] = [];
  
  if (!isCampaignData(campaignData)) {
    errors.push("Invalid campaign data");
    return errors;
  }
  
  if (!isCampaignDetails(details)) {
    errors.push("Invalid campaign details");
    return errors;
  }
  
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
  
<<<<<<< HEAD:app/components/campaign/settings/basic/CampaignBasicInfo.tsx
  if ('script_id' in details && !details.script_id && 'body_text' in details && !details.body_text) {
=======
  if (!details.script_id && !details.body_text) {
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/CampaignBasicInfo.tsx
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
<<<<<<< HEAD:app/components/campaign/settings/basic/CampaignBasicInfo.tsx
  campaignData: Campaign;
  handleInputChange: (name: string, value: string | number | null) => void;
=======
  campaignData: CampaignData;
  handleInputChange: (name: string, value: string | number) => void;
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/CampaignBasicInfo.tsx
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
<<<<<<< HEAD:app/components/campaign/settings/basic/CampaignBasicInfo.tsx
                } else if (type === "play" || type === "schedule" || type === "archive") {
                  handleConfirmStatus(type === "schedule" ? "queue" : type);
=======
                } else if (type === "play" || type === "archive") {
                  handleConfirmStatus(type);
                } else if (type === "schedule") {
                  handleButton(type);
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/CampaignBasicInfo.tsx
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
            value={campaignData.type || ""}
            onChange={(value) => handleInputChange("type", value)}
            flags={flags}
          />

          <SelectNumber
            value={campaignData.caller_id || ""}
            onChange={(value) => handleInputChange("caller_id", value)}
            phoneNumbers={phoneNumbers}
          />

          <SelectDates
            startDate={campaignData.start_date || ""}
            endDate={campaignData.end_date || ""}
            onStartDateChange={(value) => handleInputChange("start_date", value)}
            onEndDateChange={(value) => handleInputChange("end_date", value)}
          />

          <div className="space-y-2">
            <Label htmlFor="schedule">Calling Hours</Label>
            <Input
              id="schedule"
              type="text"
              placeholder="9:00 AM - 5:00 PM"
              value={campaignData.schedule || ""}
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
