import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export default function InfoHover({
  size = 18,
  tooltip = "",
  align = "center",
}) {
  return (<TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger>
        <Info size={size} />
      </TooltipTrigger>
      <TooltipContent align={align}>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>);
}
