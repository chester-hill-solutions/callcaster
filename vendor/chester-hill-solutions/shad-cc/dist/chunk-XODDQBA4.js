import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { DialogTrigger, Popover as Popover$1, Heading } from 'react-aria-components';
import { jsx } from 'react/jsx-runtime';

function PopoverTrigger({ children, ...props }) {
  return /* @__PURE__ */ jsx(DialogTrigger, { "data-slot": "popover-trigger", ...props, children });
}
function Popover({
  className,
  placement = "bottom",
  offset = 4,
  crossOffset = 0,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Popover$1,
    {
      "data-slot": "popover-content",
      placement,
      offset,
      crossOffset,
      className: cn(
        "z-50 flex w-72 origin-(--trigger-anchor-point) flex-col gap-4 rounded-md border border-border bg-popover p-4 text-sm text-popover-foreground shadow-[0_2px_0_0_var(--border)] outline-hidden duration-100 data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 data-[placement=bottom]:slide-in-from-top-2 data-[placement=left]:slide-in-from-right-2 data-[placement=right]:slide-in-from-left-2 data-[placement=top]:slide-in-from-bottom-2",
        className
      ),
      ...props
    }
  );
}
function PopoverHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "popover-header",
      className: cn("flex flex-col gap-1 text-sm", className),
      ...props
    }
  );
}
function PopoverTitle({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Heading,
    {
      "data-slot": "popover-title",
      className: cn("font-heading text-base font-semibold", className),
      ...props
    }
  );
}
function PopoverDescription({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "popover-description",
      className: cn("text-muted-foreground", className),
      ...props
    }
  );
}

export { Popover, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
//# sourceMappingURL=chunk-XODDQBA4.js.map
//# sourceMappingURL=chunk-XODDQBA4.js.map