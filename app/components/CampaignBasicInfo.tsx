import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";

import { Archive, Pause, Play, Calendar, Copy, TimerIcon, Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { FetcherWithComponents } from "@remix-run/react";
import {
  Campaign,
  Flags,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Script,
  WorkspaceNumbers,
} from "~/lib/types";
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

// Component Props Interface
interface CampaignBasicInfoProps {
  campaignData: any;
  handleInputChange: (name: string, value: string | number) => void;
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

  const isPlayDisabled = (!details?.script_id && !details.body_text) ?
    "No script selected" :
    !campaignData.caller_id || campaignData.caller_id === "+15064364568" ?
      "No outbound phone number selected" :
      null;

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
                  handleConfirmStatus(type);
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
            <Label className="text-sm font-medium">Campaign Type</Label>
            <SelectType
              handleInputChange={handleInputChange}
              campaignData={campaignData}
              flags={flags}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Phone Number</Label>
            <SelectNumber
              handleInputChange={handleInputChange}
              campaignData={campaignData}
              phoneNumbers={phoneNumbers}
            />
          </div>
        </div>
      </div>
      <div>
        <Label className="text-sm font-medium">Schedule</Label>
        <SelectDates
          campaignData={campaignData}
          handleInputChange={handleInputChange}
        />
      </div>
    </div>
  );
};
