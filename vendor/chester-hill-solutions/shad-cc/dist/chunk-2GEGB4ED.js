import { Button } from './chunk-727NWYDA.js';
import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { DialogTrigger, Modal, Dialog, Heading, ModalOverlay } from 'react-aria-components';
import { XIcon } from 'lucide-react';
import { jsx, jsxs } from 'react/jsx-runtime';

function SheetTrigger({ ...props }) {
  return /* @__PURE__ */ jsx(DialogTrigger, { "data-slot": "sheet-trigger", ...props });
}
function SheetClose({
  className,
  variant = "outline",
  size = "default",
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Button,
    {
      slot: "close",
      "data-slot": "sheet-close",
      variant,
      size,
      className: cn(className),
      ...props
    }
  );
}
function SheetOverlay({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ModalOverlay,
    {
      "data-slot": "sheet-overlay",
      isDismissable: true,
      className: cn(
        "fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-entering:opacity-0 data-exiting:opacity-0 supports-backdrop-filter:backdrop-blur-sm",
        className
      ),
      ...props,
      children
    }
  );
}
function Sheet({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}) {
  return /* @__PURE__ */ jsx(SheetOverlay, { ...props, children: /* @__PURE__ */ jsx(
    Modal,
    {
      "data-slot": "sheet-content",
      "data-side": side,
      className: cn(
        "fixed z-50 flex flex-col bg-popover bg-clip-padding text-sm text-popover-foreground shadow-[0_2px_0_0_var(--border)] transition duration-200 ease-in-out data-entering:opacity-0 data-exiting:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-entering:translate-y-[2.5rem] data-[side=bottom]:data-exiting:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-entering:translate-x-[-2.5rem] data-[side=left]:data-exiting:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-entering:translate-x-[2.5rem] data-[side=right]:data-exiting:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-entering:translate-y-[-2.5rem] data-[side=top]:data-exiting:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
        className
      ),
      children: /* @__PURE__ */ jsxs(
        Dialog,
        {
          "data-slot": "sheet",
          className: "[display:inherit] h-full max-h-[inherit] [flex-direction:inherit] [gap:inherit] outline-none",
          children: [
            children,
            showCloseButton && /* @__PURE__ */ jsx(
              SheetClose,
              {
                variant: "ghost",
                className: "absolute top-4 right-4 text-muted-foreground hover:bg-muted hover:text-foreground",
                size: "icon-sm",
                "aria-label": "Close",
                children: /* @__PURE__ */ jsx(XIcon, { className: "size-4" })
              }
            )
          ]
        }
      )
    }
  ) });
}
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Sheet,
    {
      className,
      side,
      showCloseButton,
      ...props,
      children
    }
  );
}
function SheetHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "sheet-header",
      className: cn("flex flex-col gap-1.5 p-6", className),
      ...props
    }
  );
}
function SheetFooter({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "sheet-footer",
      className: cn("mt-auto flex flex-col gap-2 p-6", className),
      ...props
    }
  );
}
function SheetTitle({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Heading,
    {
      slot: "title",
      "data-slot": "sheet-title",
      className: cn(
        "font-heading text-base font-medium text-foreground",
        className
      ),
      ...props
    }
  );
}
function SheetDescription({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "sheet-description",
      className: cn("text-sm text-muted-foreground", className),
      ...props
    }
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
//# sourceMappingURL=chunk-2GEGB4ED.js.map
//# sourceMappingURL=chunk-2GEGB4ED.js.map