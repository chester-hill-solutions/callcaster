import { Tooltip, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Button } from "./ui/button";
import { TooltipContent } from "@radix-ui/react-tooltip";
import { Campaign } from "~/lib/types";

export default function ActivateButtons({
  joinDisabled,
  scheduleDisabled,
  isBusy,
  handleScheduleButton,
}: {
  joinDisabled: string | null;
  scheduleDisabled: string | boolean;
  isBusy: boolean;
  handleScheduleButton: () => void;
}) {
  return (
    <div className="flex items-end">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex ${joinDisabled ? "cursor-not-allowed" : ""}`}>
              <Button
                type="button"
                disabled={!!scheduleDisabled || isBusy}
                onClick={(e) => {
                  e.preventDefault();
                  handleScheduleButton();
                }}
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
