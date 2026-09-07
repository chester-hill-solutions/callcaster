import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

/** Bounded by default: a tooltip wraps at a readable width and scrolls past a modest height instead of spanning the page (#1148). */
export const TOOLTIP_DEFAULT_MAX_WIDTH = "max-w-xs"
export const TOOLTIP_DEFAULT_MAX_HEIGHT = "max-h-64"

type TooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
  /** Tailwind max-width class; pass `"max-w-none"` to opt out. */
  maxWidthClassName?: string
  /** Tailwind max-height class; content scrolls beyond it. Pass `"max-h-none"` to opt out. */
  maxHeightClassName?: string
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(
  (
    {
      className,
      sideOffset = 4,
      maxWidthClassName = TOOLTIP_DEFAULT_MAX_WIDTH,
      maxHeightClassName = TOOLTIP_DEFAULT_MAX_HEIGHT,
      ...props
    },
    ref
  ) => (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-y-auto whitespace-normal break-words rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        maxWidthClassName,
        maxHeightClassName,
        className
      )}
      {...props}
    />
  )
)
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
