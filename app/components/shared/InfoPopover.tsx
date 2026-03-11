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
        <TooltipTrigger>
          <Info size={size} />
        </TooltipTrigger>
        <TooltipContent align={align}>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
