import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InfoPopoverProps {
  size?: number;
  tooltip?: string;
  align?: "center" | "start" | "end";
}

export default function InfoPopover({
  size = 18,
  tooltip = "",
  align = "center",
}: InfoPopoverProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* type="button" so this never submits a surrounding <Form> (#1107). */}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
            aria-label="More information"
          >
            <Info size={size} />
          </button>
        </TooltipTrigger>
        <TooltipContent align={align}>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
