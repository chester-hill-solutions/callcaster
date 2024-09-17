import { Tooltip, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Button } from "./ui/button";
import { TooltipContent } from "@radix-ui/react-tooltip";

export default function ActivateButtons({joinDisabled, isActive, isBusy, campaignData, handleActivateButton, handleScheduleButton, isScheduleActive}) {
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
                  Join Campaign
                </Button>
              </div>
            </TooltipTrigger>
            {(joinDisabled || !isScheduleActive) && (
              <TooltipContent align="start">
                <p>{joinDisabled || (!isScheduleActive && "Ensure your schedule & calling hours are set up.")}</p>
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
                    !isScheduleActive ||
                    joinDisabled ||
                    isBusy ||
                    !(campaignData.script_id && campaignData.caller_id)
                  }
                  onClick={handleScheduleButton}
                >
                  Schedule Campaign
                </Button>
              </div>
            </TooltipTrigger>
            {(joinDisabled || !isScheduleActive) && (
              <TooltipContent align="end">
                <p>{joinDisabled || (!isScheduleActive && "Ensure your schedule & calling hours are set up.")}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </>
  );
}
