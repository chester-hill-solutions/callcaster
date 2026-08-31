import { Dialog, DialogHeader, DialogTitle, DialogDescription } from './chunk-A33IINYN.js';
import { InputGroup, InputGroupAddon } from './chunk-FCW22EJQ.js';
import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { useFilter, Autocomplete, SearchField, Input, Menu, MenuSection, Header, Collection, Separator, MenuItem, composeRenderProps } from 'react-aria-components';
import { SearchIcon, CheckIcon } from 'lucide-react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

function Command({
  className,
  dir,
  style,
  ...props
}) {
  const { contains } = useFilter({ sensitivity: "base" });
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "command",
      dir,
      className: cn(
        "flex size-full flex-col overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-[0_2px_0_0_var(--border)]",
        className
      ),
      style,
      children: /* @__PURE__ */ jsx(Autocomplete, { ...props, filter: props.filter || contains, children: props.children })
    }
  );
}
function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  open,
  onOpenChange,
  className,
  showCloseButton = false,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    Dialog,
    {
      isOpen: open,
      onOpenChange,
      className: cn(
        "top-1/3 translate-y-0 overflow-hidden rounded-lg! border-0 p-0 shadow-none",
        className
      ),
      showCloseButton,
      isDismissable: true,
      ...props,
      children: [
        /* @__PURE__ */ jsxs(DialogHeader, { className: "sr-only", children: [
          /* @__PURE__ */ jsx(DialogTitle, { children: title }),
          /* @__PURE__ */ jsx(DialogDescription, { children: description })
        ] }),
        children
      ]
    }
  );
}
function CommandInput({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    SearchField,
    {
      autoFocus: true,
      "aria-label": props.placeholder || "Search",
      "data-slot": "command-input-wrapper",
      className: "p-1 pb-0",
      children: /* @__PURE__ */ jsxs(InputGroup, { className: "h-8! bg-card", children: [
        /* @__PURE__ */ jsx(
          Input,
          {
            ...props,
            "data-slot": "command-input",
            className: cn(
              "w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden",
              className
            )
          }
        ),
        /* @__PURE__ */ jsx(InputGroupAddon, { children: /* @__PURE__ */ jsx(SearchIcon, { className: "size-4 shrink-0 opacity-50" }) })
      ] })
    }
  );
}
function CommandList({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Menu,
    {
      ...props,
      "data-slot": "command-list",
      className: cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className
      )
    }
  );
}
function CommandEmpty({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "command-empty",
      className: cn("py-6 text-center text-sm", className),
      ...props
    }
  );
}
function CommandGroup({
  className,
  children,
  items,
  heading,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    MenuSection,
    {
      "data-slot": "command-group",
      className: cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        className
      ),
      ...props,
      children: [
        heading && /* @__PURE__ */ jsx(Header, { "cmdk-group-heading": "", children: heading }),
        /* @__PURE__ */ jsx(Collection, { items, children })
      ]
    }
  );
}
function CommandSeparator({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Separator,
    {
      "data-slot": "command-separator",
      className: cn("my-1 h-px bg-border/50", className),
      ...props
    }
  );
}
function CommandItem({
  className,
  children,
  textValue,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    MenuItem,
    {
      ...props,
      "data-slot": "command-item",
      className: cn(
        "group/command-item relative flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-md data-focused:bg-accent data-focused:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-accent data-selected:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-focused:*:[svg]:text-accent-foreground data-selected:*:[svg]:text-accent-foreground",
        className
      ),
      textValue: textValue || (typeof children === "string" ? children : void 0),
      children: composeRenderProps(children, (children2) => /* @__PURE__ */ jsxs(Fragment, { children: [
        children2,
        /* @__PURE__ */ jsx(CheckIcon, { className: "ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" })
      ] }))
    }
  );
}
function CommandShortcut({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      "data-slot": "command-shortcut",
      className: cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-focused/command-item:text-foreground group-data-selected/command-item:text-foreground",
        className
      ),
      ...props
    }
  );
}

export { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut };
//# sourceMappingURL=chunk-MS5JXYTY.js.map
//# sourceMappingURL=chunk-MS5JXYTY.js.map