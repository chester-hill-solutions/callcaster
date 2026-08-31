import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from './chunk-FCW22EJQ.js';
import { Button as Button$1 } from './chunk-C6TALT53.js';
import { cn } from './chunk-DN2AEEA2.js';
import * as React from 'react';
import { ComboBoxValue, Button, Popover, ListBox, ListBoxItem, composeRenderProps, ListBoxSection, Header, Separator, Group, TagGroup, TagList, Tag, ComboBoxStateContext, Input } from 'react-aria-components';
export { Collection, ComboBox as ComboBoxPrimitive } from 'react-aria-components';
import { ChevronDownIcon, CheckIcon, XIcon } from 'lucide-react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

function ComboboxValue({ ...props }) {
  return /* @__PURE__ */ jsx(ComboBoxValue, { "data-slot": "combobox-value", ...props });
}
function ComboboxTrigger({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    Button,
    {
      "data-slot": "combobox-trigger",
      className: cn("[&_svg:not([class*='size-'])]:size-4", className),
      ...props,
      children: [
        children,
        /* @__PURE__ */ jsx(ChevronDownIcon, { className: "pointer-events-none size-4 text-muted-foreground" })
      ]
    }
  );
}
function ComboboxClear({
  className,
  ...props
}) {
  const state = React.useContext(ComboBoxStateContext);
  if (state?.inputValue === "") {
    return null;
  }
  return /* @__PURE__ */ jsx(
    InputGroupButton,
    {
      "data-slot": "combobox-clear",
      variant: "ghost",
      size: "icon-xs",
      "aria-label": "Clear",
      className: cn(className),
      onPress: () => {
        state?.setValue(null);
      },
      slot: null,
      ...props,
      children: /* @__PURE__ */ jsx(XIcon, { className: "pointer-events-none" })
    }
  );
}
function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}) {
  return /* @__PURE__ */ jsxs(InputGroup, { className: cn("w-auto", className), children: [
    /* @__PURE__ */ jsx(InputGroupInput, { disabled, ...props }),
    /* @__PURE__ */ jsxs(InputGroupAddon, { align: "inline-end", children: [
      showTrigger && /* @__PURE__ */ jsx(
        InputGroupButton,
        {
          size: "icon-xs",
          variant: "ghost",
          "data-slot": "combobox-trigger",
          className: "group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent [&_svg:not([class*='size-'])]:size-4",
          isDisabled: disabled,
          children: /* @__PURE__ */ jsx(ChevronDownIcon, { className: "pointer-events-none size-4 text-muted-foreground" })
        }
      ),
      showClear && /* @__PURE__ */ jsx(ComboboxClear, { isDisabled: disabled })
    ] }),
    children
  ] });
}
function ComboboxContent({
  className,
  placement = "bottom",
  offset = 6,
  crossOffset = 0,
  anchor,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Popover,
    {
      "data-slot": "combobox-content",
      placement,
      offset,
      crossOffset,
      triggerRef: anchor,
      className: cn("relative isolate z-50 max-h-72 w-(--trigger-width) min-w-36 origin-(--trigger-anchor-point) overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_2px_0_0_var(--border)] duration-100 data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 data-[placement=bottom]:slide-in-from-top-2 data-[placement=left]:slide-in-from-right-2 data-[placement=right]:slide-in-from-left-2 data-[placement=top]:slide-in-from-bottom-2 **:data-[slot$=-item]:data-focused:bg-accent *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:border-border *:data-[slot=input-group]:bg-card *:data-[slot=input-group]:shadow-none", className),
      ...props
    }
  );
}
function ComboboxList({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ListBox,
    {
      "data-slot": "combobox-list",
      className: cn(
        "group/combobox-content no-scrollbar max-h-[inherit] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className
      ),
      ...props
    }
  );
}
function ComboboxItem({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ListBoxItem,
    {
      "data-slot": "combobox-item",
      textValue: typeof children === "string" ? children : void 0,
      className: cn(
        "relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-focused:bg-accent data-focused:text-accent-foreground not-data-[variant=destructive]:data-focused:**:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      ),
      ...props,
      children: composeRenderProps(children, (children2, { isSelected }) => /* @__PURE__ */ jsxs(Fragment, { children: [
        children2,
        /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute right-2 flex size-4 items-center justify-center", children: isSelected ? /* @__PURE__ */ jsx(CheckIcon, { className: "pointer-events-none" }) : null })
      ] }))
    }
  );
}
function ComboboxGroup({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ListBoxSection,
    {
      "data-slot": "combobox-group",
      className: cn(className),
      ...props
    }
  );
}
function ComboboxLabel({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Header,
    {
      "data-slot": "combobox-label",
      className: cn("px-2 py-1.5 text-xs text-muted-foreground", className),
      ...props
    }
  );
}
function ComboboxEmpty({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "combobox-empty",
      className: cn(
        "hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex",
        className
      ),
      ...props
    }
  );
}
function ComboboxSeparator({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Separator,
    {
      "data-slot": "combobox-separator",
      className: cn("-mx-1 my-1 h-px bg-border", className),
      ...props
    }
  );
}
function ComboboxChips({ children, className, ...props }) {
  return /* @__PURE__ */ jsx(
    Group,
    {
      "data-slot": "combobox-chips",
      className: cn(
        "flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-border bg-card bg-clip-padding px-2.5 py-1 text-sm shadow-[0_2px_0_0_var(--border)] transition-[color,box-shadow] duration-200 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 has-data-[slot=combobox-chip]:px-1 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40",
        className
      ),
      ...props,
      children
    }
  );
}
function ComboboxChipList({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(ComboBoxValue, { className: "contents", children: ({ selectedItems, state }) => /* @__PURE__ */ jsx(
    TagGroup,
    {
      "data-slot": "combobox-chip-list",
      className: cn("contents", className),
      onRemove: (keys) => {
        if (Array.isArray(state.value)) {
          state.setValue(state.value.filter((k) => !keys.has(k)));
        }
      },
      children: /* @__PURE__ */ jsx(
        TagList,
        {
          className: "contents",
          items: selectedItems.filter((item) => item != null),
          ...props
        }
      )
    }
  ) });
}
function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    Tag,
    {
      "data-slot": "combobox-chip",
      className: cn(
        "flex h-[calc(--spacing(5.25))] w-fit items-center justify-center gap-1 rounded-sm border border-secondary bg-secondary/60 px-1.5 font-heading text-xs font-semibold whitespace-nowrap text-secondary-foreground has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0.5",
        className
      ),
      ...props,
      children: [
        children,
        showRemove && /* @__PURE__ */ jsx(
          Button$1,
          {
            slot: "remove",
            variant: "ghost",
            size: "icon-xs",
            className: "-ml-0.5 size-4.5 opacity-50 hover:opacity-100 aria-disabled:pointer-events-none",
            "data-slot": "combobox-chip-remove",
            children: /* @__PURE__ */ jsx(XIcon, { className: "pointer-events-none" })
          }
        )
      ]
    }
  );
}
function ComboboxChipsInput({ className, ...props }) {
  const state = React.useContext(ComboBoxStateContext);
  return /* @__PURE__ */ jsx(
    Input,
    {
      "data-slot": "combobox-chip-input",
      className: cn("min-w-16 flex-1 outline-none", className),
      onKeyDown: (e) => {
        if (e.key === "Backspace" && e.currentTarget.value === "" && Array.isArray(state?.value) && state.value.length > 0) {
          e.preventDefault();
          state.setValue(state.value.slice(0, -1));
        }
      },
      ...props
    }
  );
}
function useComboboxAnchor() {
  return React.useRef(null);
}

export { ComboboxChip, ComboboxChipList, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxSeparator, ComboboxTrigger, ComboboxValue, useComboboxAnchor };
//# sourceMappingURL=chunk-EBDEBHAO.js.map
//# sourceMappingURL=chunk-EBDEBHAO.js.map