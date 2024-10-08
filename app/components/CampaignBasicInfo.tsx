
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import {
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
import { Archive, Pause, Play, Calendar } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { FetcherWithComponents } from "@remix-run/react";
import { CampaignSettingsData } from "./CampaignSettings";

type ButtonState = "Active" | "Inactive" | "Disabled";

type CampaignState =
  | "running"
  | "paused"
  | "archived"
  | "draft"
  | "pending"
  | "scheduled"
  | "complete";

const getButtonStates = (
  campaignState: CampaignState,
  isJoinDisabled: boolean,
): Record<string, ButtonState> => {
  const states: Record<string, ButtonState> = {
    play: "Disabled",
    pause: "Disabled",
    archive: "Disabled",
  };

  switch (campaignState) {
    case "running":
      states.pause = "Inactive";
      states.play = "Active";
      states.archive = "Inactive";
      break;
    case "paused":
      states.play = isJoinDisabled ? "Disabled" : "Inactive";
      states.archive = "Inactive";
      states.pause = "Active"
      break;
    case "draft":
    case "pending":
    case "scheduled":
      states.play = isJoinDisabled ? "Disabled" : "Inactive";
      states.archive = "Inactive";
      break;
    case "complete":
      states.archive = "Inactive";
      break;
    case "archived":
      break;
  }

  return states;
};


export const CampaignBasicInfo = ({
  campaignData,
  handleInputChange,
  phoneNumbers,
  flags,
  handleButton,
  formFetcher,
  details,
}: {
  campaignData: any;
  handleInputChange: (name: string, value: string | number) => void;
  phoneNumbers: WorkspaceNumbers[];
  flags: Flags;
  handleButton: (type: "play" | "pause" | "archive") => void;
  joinDisabled: string | null;
  formFetcher: FetcherWithComponents<CampaignSettingsData>;
  details:
    | ((LiveCampaign | IVRCampaign) & { script: Script })
    | MessageCampaign;
}) => {

  const joinDisabled =
    !campaignData?.script_id && !campaignData.body_text
      ? "No script selected"
      : !campaignData.caller_id || campaignData.caller_id === "+15064364568"
        ? "No outbound phone number selected"
        : !campaignData.audiences?.length
          ? "No audiences selected"
          : null;
  const buttonStates = getButtonStates(
    campaignData.status as CampaignState,
    !!joinDisabled,
  );

  const renderButton = (
    type: "play" | "pause" | "archive",
    icon: React.ReactNode,
    tooltip: string,
  ) => {
    const state = buttonStates[type];
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Button
              type="button"
              variant={state === "Active" ? "default" : "outline"}
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                handleButton(type);
              }}
              disabled={state === "Disabled"}
              className={`
                ${state === "Active" ? "bg-primary text-primary-foreground shadow-sm" : ""}
                ${state === "Inactive" ? "border-primary" : ""}
                ${state === "Disabled" ? "cursor-not-allowed opacity-50" : ""}
              `}
            >
              {icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent align="end">
            {state === "Active"
              ? `Currently ${type === "play" ? "running" : `${type}ed`}`
              : tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex flex-wrap gap-6">
        <div className="flex min-w-48 flex-grow flex-col gap-1">
          <Label htmlFor="title">Campaign Title</Label>
          <Input
            id="title"
            name="title"
            value={campaignData.title}
            onChange={(e) => handleInputChange("title", e.target.value)}
          />
        </div>
        <SelectType
          handleInputChange={handleInputChange}
          campaignData={campaignData}
          flags={flags}
        />
        <SelectNumber
          handleInputChange={handleInputChange}
          campaignData={campaignData}
          phoneNumbers={phoneNumbers}
        />
        <div className="flex items-end">
          <div className="flex gap-2">
            {renderButton(
              "play",
              <Play className="h-4 w-4" />,
              joinDisabled || "Start the campaign",
            )}
            {renderButton(
              "pause",
              <Pause className="h-4 w-4" />,
              "Pause the campaign",
            )}
            {renderButton(
              "archive",
              <Archive className="h-4 w-4" />,
              "Archive the campaign",
            )}
          </div>
        </div>
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
