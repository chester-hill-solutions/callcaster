import * as React from "react";
import { Tooltip as TooltipPrimitive, TooltipTrigger as TooltipTriggerPrimitive } from "react-aria-components";
declare function TooltipTrigger({ delay, children, ...props }: React.ComponentProps<typeof TooltipTriggerPrimitive>): React.JSX.Element;
declare function Tooltip({ className, placement, offset, crossOffset, children, ...props }: Omit<React.ComponentProps<typeof TooltipPrimitive>, "children" | "className"> & {
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element;
export { Tooltip, TooltipTrigger };
