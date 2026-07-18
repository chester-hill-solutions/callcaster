import { InputGroup, InputGroupInput, InputGroupAddon } from './chunk-KBDZNZE2.js';
import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { Select as Select$1, ListBoxSection, SelectValue as SelectValue$1, Button, Popover, ListBox, SearchField, Header, ListBoxItem, composeRenderProps, Separator } from 'react-aria-components';
import { ChevronDownIcon, SearchIcon, CheckIcon } from 'lucide-react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

function Select({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Select$1,
    {
      "data-slot": "select",
      className: cn("group/select w-fit", className),
      ...props
    }
  );
}
function SelectGroup({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ListBoxSection,
    {
      "data-slot": "select-group",
      className: cn("scroll-my-1.5 p-1", className),
      ...props
    }
  );
}
function SelectValue({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    SelectValue$1,
    {
      "data-slot": "select-value",
      className: cn(
        "flex flex-1 text-left data-placeholder:text-muted-foreground",
        className
      ),
      ...props,
      children: typeof children === "function" ? children : ({ selectedItems, selectedText, defaultChildren }) => selectedItems.length > 1 ? selectedText : defaultChildren
    }
  );
}
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    Button,
    {
      "data-slot": "select-trigger",
      "data-size": size,
      className: cn(
        "flex w-full items-center justify-between gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm whitespace-nowrap shadow-[0_2px_0_0_var(--border)] transition-[color,box-shadow] duration-200 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground data-[size=default]:h-10 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-invalid/select:border-destructive group-data-invalid/select:text-destructive group-data-invalid/select:ring-2 group-data-invalid/select:ring-destructive/20 group-data-invalid/select:focus-visible:border-destructive group-data-invalid/select:focus-visible:ring-destructive/30 dark:group-data-invalid/select:border-destructive/60 dark:group-data-invalid/select:ring-destructive/40",
        className
      ),
      ...props,
      children: [
        children,
        /* @__PURE__ */ jsx(ChevronDownIcon, { className: "pointer-events-none size-4 text-muted-foreground group-data-invalid/select:text-destructive" })
      ]
    }
  );
}
function SelectContent({
  className,
  children,
  placement = "bottom",
  offset = 4,
  crossOffset = 0,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    SelectPopover,
    {
      className,
      placement,
      offset,
      crossOffset,
      ...props,
      children: /* @__PURE__ */ jsx(SelectList, { children })
    }
  );
}
function SelectPopover({
  className,
  children,
  placement = "bottom start",
  offset = 4,
  crossOffset = 0,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Popover,
    {
      "data-slot": "select-content",
      placement,
      offset,
      crossOffset,
      className: cn("relative isolate z-50 w-(--trigger-width) min-w-36 origin-(--trigger-anchor-point) overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_2px_0_0_var(--border)] duration-100 data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 data-[placement=bottom]:slide-in-from-top-2 data-[placement=left]:slide-in-from-right-2 data-[placement=right]:slide-in-from-left-2 data-[placement=top]:slide-in-from-bottom-2 **:data-[slot$=-item]:data-focused:bg-accent", className),
      ...props,
      children
    }
  );
}
function SelectList({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ListBox,
    {
      "data-slot": "select-list",
      className: cn(
        "group/select-list max-h-[inherit] overflow-x-hidden overflow-y-auto p-0 outline-hidden",
        className
      ),
      ...props
    }
  );
}
function SelectInput({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    SearchField,
    {
      ...props,
      autoFocus: true,
      "data-slot": "select-input-wrapper",
      className: cn("p-1 pb-0", className),
      children: /* @__PURE__ */ jsxs(InputGroup, { children: [
        /* @__PURE__ */ jsx(
          InputGroupInput,
          {
            "data-slot": "select-input",
            className: "[&::-webkit-search-cancel-button]:hidden"
          }
        ),
        /* @__PURE__ */ jsx(InputGroupAddon, { children: /* @__PURE__ */ jsx(SearchIcon, { className: "size-4 shrink-0 opacity-50" }) })
      ] })
    }
  );
}
function SelectLabel({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Header,
    {
      "data-slot": "select-label",
      className: cn("px-2 py-1 text-xs text-muted-foreground", className),
      ...props
    }
  );
}
function SelectItem({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ListBoxItem,
    {
      "data-slot": "select-item",
      textValue: typeof children === "string" ? children : void 0,
      className: cn(
        "relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-focused:bg-accent data-focused:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      ),
      ...props,
      children: composeRenderProps(children, (children2, { isSelected }) => /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("span", { className: "flex flex-1 shrink-0 gap-2 whitespace-nowrap", children: children2 }),
        /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute right-2 flex size-4 items-center justify-center", children: isSelected ? /* @__PURE__ */ jsx(CheckIcon, { className: "pointer-events-none" }) : null })
      ] }))
    }
  );
}
function SelectSeparator({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Separator,
    {
      "data-slot": "select-separator",
      className: cn("pointer-events-none -mx-1 my-1 h-px bg-border", className),
      ...props
    }
  );
}
function SelectEmpty({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "select-empty",
      className: cn(
        "hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/select-list:flex",
        className
      ),
      ...props
    }
  );
}

export { Select, SelectContent, SelectEmpty, SelectGroup, SelectInput, SelectItem, SelectLabel, SelectList, SelectPopover, SelectSeparator, SelectTrigger, SelectValue };
//# sourceMappingURL=chunk-2FYTT6NB.js.map
//# sourceMappingURL=chunk-2FYTT6NB.js.map