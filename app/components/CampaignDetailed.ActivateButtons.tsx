import { Tooltip, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Button } from "./ui/button";
import { TooltipContent } from "@radix-ui/react-tooltip";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";

export default function ActivateButtons({joinDisabled, isActive, isBusy, campaignData, handleActivateButton, handleScheduleButton}) {
  return (
    <>
      <div className="flex items-end">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`flex ${joinDisabled || !isActive ? "cursor-not-allowed" : ""}`}
              >
                <Button
                  type="button"
                  disabled={
                    !isActive ||
                    joinDisabled ||
                    isBusy ||
                    !(campaignData.script_id && campaignData.caller_id)
                  }
                  onClick={handleActivateButton}
                >
                  Activate Campaign
                </Button>
              </div>
            </TooltipTrigger>
            {joinDisabled && (
              <TooltipContent align="start">
                <p>{!isActive || joinDisabled}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-end">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`flex ${joinDisabled ? "cursor-not-allowed" : ""}`}
              >
                <Button
                  type="button"
                  disabled={
                    joinDisabled ||
                    isBusy ||
                    !(campaignData.script_id && campaignData.caller_id)
                  }
                  onClick={handleScheduleButton}
                >
                  Schedule for{" "}
                  {format(campaignData.start_date, "PP hh:mm b", {
                    locale: enUS,
                  })}
                </Button>
              </div>
            </TooltipTrigger>
            {joinDisabled && (
              <TooltipContent align="start">
                <p>{!isActive || joinDisabled}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </>
  );
}
