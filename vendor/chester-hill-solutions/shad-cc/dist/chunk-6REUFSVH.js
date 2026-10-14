import {
  cn
} from "./chunk-DN2AEEA2.js";

// src/components/ui/tooltip.tsx
import * as React from "react";
import {
  Focusable,
  OverlayArrow,
  Tooltip as TooltipPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive
} from "react-aria-components";
import { jsx, jsxs } from "react/jsx-runtime";
function TooltipTrigger({
  delay = 0,
  children,
  ...props
}) {
  const [trigger, tooltip] = React.Children.toArray(children);
  return /* @__PURE__ */ jsxs(
    TooltipTriggerPrimitive,
    {
      "data-slot": "tooltip-trigger",
      delay,
      ...props,
      children: [
        /* @__PURE__ */ jsx(Focusable, { children: trigger }),
        tooltip
      ]
    }
  );
}
function Tooltip({
  className,
  placement = "top",
  offset = 4,
  crossOffset = 0,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    TooltipPrimitive,
    {
      "data-slot": "tooltip-content",
      placement,
      offset,
      crossOffset,
      className: cn(
        "z-50 inline-flex w-fit max-w-xs origin-(--trigger-anchor-point) items-center gap-1.5 rounded-md border border-border bg-popover px-3 py-1.5 font-heading text-xs font-semibold text-popover-foreground shadow-[0_2px_0_0_var(--border)] has-data-[slot=kbd]:pr-1.5 data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 data-[placement=bottom]:slide-in-from-top-2 data-[placement=left]:slide-in-from-right-2 data-[placement=right]:slide-in-from-left-2 data-[placement=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
        className
      ),
      ...props,
      children: [
        children,
        /* @__PURE__ */ jsx(
          OverlayArrow,
          {
            className: "z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] border border-border bg-popover fill-popover data-[side=left]:translate-x-[-1.5px] data-[side=right]:translate-x-[1.5px]",
            style: ({ placement: placement2, defaultStyle }) => ({
              ...defaultStyle,
              rotate: "0deg",
              translate: "0 0",
              transform: placement2 === "bottom" ? "translate(-50%, calc(50% + 2px)) rotate(45deg)" : placement2 === "top" ? "translate(-50%, calc(-50% - 2px)) rotate(45deg)" : placement2 === "left" ? "translate(calc(-50% - 2px), -50%) rotate(45deg)" : "translate(calc(50% + 2px), -50%) rotate(45deg)"
            })
          }
        )
      ]
    }
  );
}

export {
  TooltipTrigger,
  Tooltip
};
//# sourceMappingURL=chunk-6REUFSVH.js.map