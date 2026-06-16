import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export default function ActivateButtons({
  joinDisabled,
  scheduleDisabled,
  isBusy,
  handleScheduleButton,
  status,
}: {
  joinDisabled: string | null;
  scheduleDisabled: string | boolean;
  isBusy: boolean;
  handleScheduleButton: () => void;
  status?: string | null;
}) {
  const isScheduled = status === "scheduled";
  return (
    <div className="flex items-end gap-1">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex ${joinDisabled ? "cursor-not-allowed" : ""}`}>
              <Button
                type="button"
                disabled={!!scheduleDisabled || isBusy || isScheduled}
                onClick={(e) => {
                  e.preventDefault();
                  handleScheduleButton();
                }}
              >
                {isScheduled ? "Scheduled" : "Schedule Campaign"}
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
