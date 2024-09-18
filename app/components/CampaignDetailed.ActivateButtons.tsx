import { Tooltip, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Button } from "./ui/button";
import { TooltipContent } from "@radix-ui/react-tooltip";

export default function ActivateButtons({
  joinDisabled,
  isBusy,
  campaignData,
  handleScheduleButton,
}) {
  const scheduleDisabled = !campaignData?.script_id
    ? "No script selected"
    : !campaignData.caller_id
      ? "No outbound phone number selected"
      : !campaignData.audiences?.length
        ? "No audiences selected"
        : null;
  return (
    <div className="flex items-end">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex ${joinDisabled ? "cursor-not-allowed" : ""}`}>
              <Button
                type="button"
                disabled={!!scheduleDisabled || isBusy}
                onClick={handleScheduleButton}
              >
                Schedule Campaign
              </Button>
            </div>
          </TooltipTrigger>
          {scheduleDisabled && (
            <TooltipContent align="end">
              <p>{scheduleDisabled}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
