import * as React from "react";

import {
  Popover as ShadPopover,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger as ShadPopoverTrigger,
} from "@chester-hill-solutions/shad-cc/popover";

type PopoverRootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

/** Radix-shaped Popover root → React Aria DialogTrigger. */
function Popover({
  open,
  defaultOpen,
  onOpenChange,
  children,
}: PopoverRootProps) {
  return (
    <ShadPopoverTrigger
      isOpen={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {children}
    </ShadPopoverTrigger>
  );
}

type PopoverTriggerProps = {
  asChild?: boolean;
  children?: React.ReactNode;
  disabled?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

function PopoverTrigger({
  asChild,
  children,
  disabled,
  ...props
}: PopoverTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    if (disabled) {
      return React.cloneElement(
        children as React.ReactElement<{ isDisabled?: boolean; disabled?: boolean }>,
        { isDisabled: true, disabled: true },
      );
    }
    return children;
  }
  return (
    <button type="button" disabled={disabled} {...props}>
      {children}
    </button>
  );
}

type PopoverContentProps = React.ComponentProps<typeof ShadPopover> & {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
};

function PopoverContent({
  align,
  side,
  sideOffset,
  placement,
  offset,
  ...props
}: PopoverContentProps) {
  const resolvedPlacement =
    placement ??
    (side && align
      ? (`${side} ${align}` as const)
      : side
        ? side
        : align
          ? (`bottom ${align}` as const)
          : "bottom");

  return (
    <ShadPopover
      placement={resolvedPlacement as React.ComponentProps<typeof ShadPopover>["placement"]}
      offset={offset ?? sideOffset ?? 4}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
};
