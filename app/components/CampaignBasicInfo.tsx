import React, { useState, useEffect } from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import { Flags, WorkspaceNumbers } from "~/lib/types";
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

export const CampaignBasicInfo = ({
  campaignData,
  handleInputChange,
  phoneNumbers,
  flags,
  handleButton,
}: {
  campaignData: any;
  handleInputChange: (name: string, value: string | number) => void;
  phoneNumbers: WorkspaceNumbers[];
  flags: Flags;
  handleButton: (type: "play" | "pause" | "archive") => void;
  joinDisabled: string | null;
}) => {
  const isRunning = campaignData.status === "running";
  const isPaused = campaignData.status === "paused";
  const isArchivable = [
    "running",
    "paused",
    "complete",
    "draft",
    "pending",
    "scheduled",
  ].includes(campaignData.status);

  const joinDisabled =
    !campaignData?.script_id && !campaignData.body_text
      ? "No script selected"
      : !campaignData.caller_id || campaignData.caller_id === "+15064364568"
        ? "No outbound phone number selected"
        : !campaignData.audiences?.length
          ? "No audiences selected"
          : null;
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger disabled={isRunning || joinDisabled}>
                  <Button
                    type="button"
                    variant={isRunning ? "default" : "outline"}
                    className={`${joinDisabled || isRunning ? "pointer-events-none bg-green-600" : ""}`}
                    size="icon"
                    onClick={(e) => handleButton("play")}
                    disabled={isRunning || joinDisabled}
                  >
                    <Play
                      className="h-4 w-4"
                      color={isRunning ? "#333" : "#7cb342"}
                    />
                  </Button>
                </TooltipTrigger>
                {joinDisabled && (
                  <TooltipContent align="end">{joinDisabled}</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    type="button"
                    variant={isPaused ? "default" : "outline"}
                    size="icon"
                    onClick={() => handleButton("pause")}
                    disabled={!isRunning}
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                {!isPaused && (
                  <TooltipContent align="end">This will pause your campaign and stop any ongoing outgoing {`${campaignData.type === "message" ? "messages" : "calls"}`}.</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={`border-red-400`}
                    onClick={() => handleButton("archive")}
                    disabled={!isArchivable}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                {isArchivable && (
                  <TooltipContent className="bg-red-50"  align="end">This will stop your campaign and hide it from campaign view. Any ongoing {`${campaignData.type === "message" ? "messages" : "calls"}`} will be ended.</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <SelectDates
            campaignData={campaignData}
            handleInputChange={handleInputChange}
          />
        </div>
      </div>
    </div>
  );
};
