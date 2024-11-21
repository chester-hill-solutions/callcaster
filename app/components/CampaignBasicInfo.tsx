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
      states.archive = "Inactive";
      states.pause = "Active";
      states.schedule = "Inactive";
      break;
    case "draft":
    case "pending":
      states.play = isPlayDisabled ? "Disabled" : "Inactive";
      states.archive = "Inactive";
      states.schedule = "Inactive";
      break;
    case "scheduled":
      states.play = isPlayDisabled ? "Disabled" : "Inactive";
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

  handleDuplicateButton: () => void;
  joinDisabled: string | null;
  formFetcher: FetcherWithComponents<{
    campaign: Campaign;
    campaignDetails: LiveCampaign | IVRCampaign | MessageCampaign;
  }>;
  details: ((LiveCampaign | IVRCampaign) & { script: Script }) | MessageCampaign;

  scheduleDisabled: string | boolean;
}

// Main Component
export const CampaignBasicInfo = ({
  campaignData,
  handleInputChange,
  phoneNumbers,
  joinDisabled,
  flags,
  handleButton,
  handleDuplicateButton,
  formFetcher,
  details,

  scheduleDisabled,
}: CampaignBasicInfoProps) => {

  const isPlayDisabled = (!campaignData?.script_id && !campaignData.body_text) ?
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
                } else {
                  handleButton(type as "play" | "pause" | "archive");
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
    <div className="flex flex-wrap gap-6">

      {/* Control Buttons */}
      <div className="flex justify-end">
        <div className="flex gap-2">
          {renderButton(
            "play",
            <Play className="h-4 w-4" />,
            isPlayDisabled || "Start the campaign",
          )}
          {renderButton(
            "schedule",
            <Clock className="h-4 w-4" />,
            "Schedule the campaign",
          )}
          {renderButton(
            "pause",
            <Pause className="h-4 w-4" />,
            "Pause the campaign",
          )}
          {renderButton(
            "duplicate",
            <Copy className="h-4 w-4" />,
            "Duplicate the campaign",
          )}
          {renderButton(
            "archive",
            <Archive className="h-4 w-4" />,
            "Archive the campaign",
          )}

        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        {/* Campaign Title */}
        <div className="flex min-w-48 flex-grow flex-col gap-1">
          <Label htmlFor="title">Campaign Title</Label>
          <Input
            id="title"
            name="title"
            value={campaignData.title}
            onChange={(e) => handleInputChange("title", e.target.value)}
          />
        </div>

        {/* Campaign Type Selection */}
        <SelectType
          handleInputChange={handleInputChange}
          campaignData={campaignData}
          flags={flags}
        />

        {/* Phone Number Selection */}
        <SelectNumber
          handleInputChange={handleInputChange}
          campaignData={campaignData}
          phoneNumbers={phoneNumbers}
        />


        {/* Date Selection */}
        <div className="flex flex-wrap gap-6">
          <SelectDates
            campaignData={campaignData}
            handleInputChange={handleInputChange}
            formFetcher={formFetcher}
            details={details}
          />
        </div>
      </div>
    </div>
  );
};
