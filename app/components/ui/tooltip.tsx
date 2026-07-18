import * as React from "react";

import {
  Tooltip as ShadTooltip,
  TooltipTrigger as ShadTooltipTrigger,
} from "@chester-hill-solutions/shad-cc/tooltip";

/** No-op provider — React Aria tooltips do not need a portal provider. */
function TooltipProvider({
  children,
}: {
  children?: React.ReactNode;
  delayDuration?: number;
}) {
  return <>{children}</>;
}

type TooltipRootProps = {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
};

/**
 * Radix-shaped Tooltip: Root wraps Trigger + Content as RAC TooltipTrigger children.
 */
function Tooltip({
  children,
  open,
  defaultOpen,
  onOpenChange,
  delayDuration = 0,
}: TooltipRootProps) {
  return (
    <ShadTooltipTrigger
      isOpen={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      delay={delayDuration}
    >
      {children}
    </ShadTooltipTrigger>
  );
}

type TooltipTriggerProps = {
  asChild?: boolean;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>;

function TooltipTrigger({ asChild, children, ...props }: TooltipTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    return children;
  }
  return (
    <button type="button" {...props}>
      {children}
    </button>
  );
}

type TooltipContentProps = React.ComponentProps<typeof ShadTooltip> & {
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  align?: "start" | "center" | "end";
};

function TooltipContent({
  side,
  sideOffset,
  align,
  placement,
  offset,
  ...props
}: TooltipContentProps) {
  const resolvedPlacement =
    placement ??
    (side && align && align !== "center"
      ? (`${side} ${align}` as const)
      : (side ?? "top"));

  return (
    <ShadTooltip
      placement={
        resolvedPlacement as React.ComponentProps<typeof ShadTooltip>["placement"]
      }
      offset={offset ?? sideOffset ?? 4}
      {...props}
    />
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
