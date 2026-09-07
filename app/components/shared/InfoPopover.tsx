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
  side?: "top" | "right" | "bottom" | "left";
  /** Tailwind max-width class for the bubble; defaults to the tooltip's bound. */
  maxWidthClassName?: string;
  /** Tailwind max-height class for the bubble; longer text scrolls. */
  maxHeightClassName?: string;
}

export default function InfoPopover({
  size = 18,
  tooltip = "",
  align = "center",
  side,
  maxWidthClassName,
  maxHeightClassName,
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
        <TooltipContent
          align={align}
          side={side}
          maxWidthClassName={maxWidthClassName}
          maxHeightClassName={maxHeightClassName}
        >
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
