import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { cva } from 'class-variance-authority';
import { MenuTrigger, Popover, Menu, MenuSection, Header, MenuItem, composeRenderProps, SubmenuTrigger, Separator } from 'react-aria-components';
import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

function DropdownMenuTrigger({
  ...props
}) {
  return /* @__PURE__ */ jsx(MenuTrigger, { "data-slot": "dropdown-menu-trigger", ...props });
}
function DropdownMenu({
  "data-slot": dataSlot = "dropdown-menu-content",
  placement = "bottom start",
  offset = 4,
  crossOffset = 0,
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Popover,
    {
      "data-slot": dataSlot,
      placement,
      offset,
      crossOffset,
      className: cn("z-50 w-(--trigger-width) min-w-32 origin-(--trigger-anchor-point) overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-[0_2px_0_0_var(--border)] duration-100 outline-none data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:overflow-hidden data-exiting:fade-out-0 data-exiting:zoom-out-95 data-[placement=bottom]:slide-in-from-top-2 data-[placement=left]:slide-in-from-right-2 data-[placement=right]:slide-in-from-left-2 data-[placement=top]:slide-in-from-bottom-2 **:data-[slot$=-item]:data-focused:bg-foreground/10 ", className),
      children: /* @__PURE__ */ jsx(
        Menu,
        {
          className: "max-h-[inherit] overflow-x-hidden overflow-y-auto outline-hidden",
          ...props,
          children
        }
      )
    }
  );
}
function DropdownMenuGroup({
  ...props
}) {
  return /* @__PURE__ */ jsx(MenuSection, { "data-slot": "dropdown-menu-group", ...props });
}
function DropdownMenuLabel({
  className,
  inset,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Header,
    {
      "data-slot": "dropdown-menu-label",
      "data-inset": inset,
      className: cn(
        "px-2 py-1 text-xs text-muted-foreground data-inset:pl-7",
        className
      ),
      ...props
    }
  );
}
var dropdownMenuItemVariants = cva(
  "group/dropdown-menu-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      selectionMode: {
        none: "min-h-7 gap-2 rounded-md px-2 py-1.5 text-sm focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        single: "min-h-7 gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4",
        multiple: "min-h-7 gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4"
      }
    }
  }
);
function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    MenuItem,
    {
      "data-slot": "dropdown-menu-item",
      "data-inset": inset,
      "data-variant": variant,
      textValue: typeof children === "string" ? children : props.textValue,
      className: composeRenderProps(
        className,
        (className2, { selectionMode }) => cn(dropdownMenuItemVariants({ selectionMode }), className2)
      ),
      ...props,
      children: composeRenderProps(
        children,
        (children2, { isSelected, selectionMode }) => /* @__PURE__ */ jsxs(Fragment, { children: [
          selectionMode !== "none" ? /* @__PURE__ */ jsx(
            "span",
            {
              className: "pointer-events-none absolute right-2 flex items-center justify-center",
              "data-slot": selectionMode === "single" ? "dropdown-menu-radio-item-indicator" : "dropdown-menu-checkbox-item-indicator",
              children: isSelected ? /* @__PURE__ */ jsx(
                CheckIcon,
                {}
              ) : null
            }
          ) : null,
          children2
        ] })
      )
    }
  );
}
function DropdownMenuSub({
  ...props
}) {
  return /* @__PURE__ */ jsx(SubmenuTrigger, { "data-slot": "dropdown-menu-sub", ...props });
}
function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    MenuItem,
    {
      "data-slot": "dropdown-menu-sub-trigger",
      "data-inset": inset,
      textValue: typeof children === "string" ? children : props.textValue,
      className: cn(
        "flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      ),
      ...props,
      children: composeRenderProps(children, (children2) => /* @__PURE__ */ jsxs(Fragment, { children: [
        children2,
        /* @__PURE__ */ jsx(ChevronRightIcon, { className: "ml-auto" })
      ] }))
    }
  );
}
function DropdownMenuSubContent({
  placement = "end top",
  crossOffset = -3,
  offset = 0,
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DropdownMenu,
    {
      "data-slot": "dropdown-menu-sub-content",
      className: cn("w-auto min-w-[96px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-[0_2px_0_0_var(--border)] duration-100 ", className),
      placement,
      crossOffset,
      offset,
      ...props
    }
  );
}
function DropdownMenuSeparator({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Separator,
    {
      "data-slot": "dropdown-menu-separator",
      className: cn("-mx-1 my-1 h-px bg-border/50", className),
      ...props
    }
  );
}
function DropdownMenuShortcut({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      "data-slot": "dropdown-menu-shortcut",
      className: cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className
      ),
      ...props
    }
  );
}

export { DropdownMenu, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger };
//# sourceMappingURL=chunk-UJ357NXV.js.map
//# sourceMappingURL=chunk-UJ357NXV.js.map