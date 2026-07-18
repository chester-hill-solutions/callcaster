import { cn } from './chunk-DN2AEEA2.js';
import * as React from 'react';
import { cva } from 'class-variance-authority';
import { Popover, Menu, MenuTrigger, PopoverContext, MenuSection, Header, MenuItem, composeRenderProps, SubmenuTrigger, Separator } from 'react-aria-components';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

function ContextMenu({
  "data-slot": dataSlot = "context-menu-content",
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
      className: cn("z-50 w-(--trigger-width) min-w-36 origin-(--trigger-anchor-point) overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-[0_2px_0_0_var(--border)] duration-100 outline-none data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:overflow-hidden data-exiting:fade-out-0 data-exiting:zoom-out-95 data-[placement=bottom]:slide-in-from-top-2 data-[placement=left]:slide-in-from-right-2 data-[placement=right]:slide-in-from-left-2 data-[placement=top]:slide-in-from-bottom-2 **:data-[slot$=-item]:data-focused:bg-foreground/10 ", className),
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
function ContextMenuTrigger({
  children,
  className,
  onOpenChange,
  ...props
}) {
  const [position, setPosition] = React.useState(null);
  const positionRef = React.useRef(null);
  return /* @__PURE__ */ jsxs(
    MenuTrigger,
    {
      "data-slot": "context-menu",
      ...props,
      isOpen: !!position,
      onOpenChange: (isOpen) => {
        if (!isOpen) {
          setPosition(null);
          onOpenChange?.(false);
        }
      },
      children: [
        position && createPortal(
          // Position the popover at the pointer.
          /* @__PURE__ */ jsx(
            "div",
            {
              "data-slot": "context-menu-anchor",
              ref: positionRef,
              style: {
                position: "fixed",
                top: position.y,
                left: position.x
              }
            }
          ),
          document.body
        ),
        /* @__PURE__ */ jsx(
          "div",
          {
            "data-slot": "context-menu-trigger",
            className: cn("contents select-none", className),
            onContextMenu: (e) => {
              e.preventDefault();
              const wasOpen = position !== null;
              setPosition({
                y: e.clientY,
                x: e.clientX
              });
              if (!wasOpen) {
                onOpenChange?.(true);
              }
            },
            children: /* @__PURE__ */ jsx(PopoverContext.Consumer, { children: (ctx) => /* @__PURE__ */ jsx(
              PopoverContext.Provider,
              {
                value: {
                  ...ctx,
                  ...position,
                  triggerRef: positionRef,
                  style: void 0
                },
                children
              }
            ) })
          }
        )
      ]
    }
  );
}
function ContextMenuGroup({
  ...props
}) {
  return /* @__PURE__ */ jsx(MenuSection, { "data-slot": "context-menu-group", ...props });
}
function ContextMenuLabel({
  className,
  inset,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Header,
    {
      "data-slot": "context-menu-label",
      "data-inset": inset,
      className: cn(
        "px-2 py-1 text-xs text-muted-foreground data-inset:pl-7",
        className
      ),
      ...props
    }
  );
}
var contextMenuItemVariants = cva(
  "group/context-menu-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      selectionMode: {
        none: "min-h-7 gap-2 rounded-md px-2 py-1.5 text-sm focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg:not([class*='size-'])]:size-4 focus:*:[svg]:text-accent-foreground data-[variant=destructive]:*:[svg]:text-destructive",
        single: "min-h-7 gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm focus:bg-accent focus:text-accent-foreground data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4",
        multiple: "min-h-7 gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm focus:bg-accent focus:text-accent-foreground data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4"
      }
    }
  }
);
function ContextMenuItem({
  className,
  inset,
  variant = "default",
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    MenuItem,
    {
      "data-slot": "context-menu-item",
      "data-inset": inset,
      "data-variant": variant,
      textValue: typeof children === "string" ? children : props.textValue,
      className: composeRenderProps(
        className,
        (className2, { selectionMode }) => cn(contextMenuItemVariants({ selectionMode }), className2)
      ),
      ...props,
      children: composeRenderProps(
        children,
        (children2, { isSelected, selectionMode }) => /* @__PURE__ */ jsxs(Fragment, { children: [
          selectionMode !== "none" ? /* @__PURE__ */ jsx(
            "span",
            {
              className: "pointer-events-none absolute right-2",
              "data-slot": selectionMode === "single" ? "context-menu-radio-item-indicator" : "context-menu-checkbox-item-indicator",
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
function ContextMenuSub({
  ...props
}) {
  return /* @__PURE__ */ jsx(SubmenuTrigger, { "data-slot": "context-menu-sub", ...props });
}
function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    MenuItem,
    {
      "data-slot": "context-menu-sub-trigger",
      "data-inset": inset,
      textValue: typeof children === "string" ? children : props.textValue,
      className: cn(
        "flex min-h-7 cursor-default items-center rounded-md px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
function ContextMenuSubContent({
  placement = "end top",
  crossOffset = -3,
  offset = 0,
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ContextMenu,
    {
      "data-slot": "context-menu-sub-content",
      className: cn("w-auto min-w-32 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-[0_2px_0_0_var(--border)] duration-100 ", className),
      placement,
      crossOffset,
      offset,
      ...props
    }
  );
}
function ContextMenuSeparator({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Separator,
    {
      "data-slot": "context-menu-separator",
      className: cn("-mx-1 my-1 h-px bg-border/50", className),
      ...props
    }
  );
}
function ContextMenuShortcut({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      "data-slot": "context-menu-shortcut",
      className: cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/context-menu-item:text-accent-foreground",
        className
      ),
      ...props
    }
  );
}

export { ContextMenu, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger };
//# sourceMappingURL=chunk-XZSVXOQW.js.map
//# sourceMappingURL=chunk-XZSVXOQW.js.map