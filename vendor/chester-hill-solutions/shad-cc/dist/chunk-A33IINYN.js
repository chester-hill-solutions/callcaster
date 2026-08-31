import { Button } from './chunk-C6TALT53.js';
import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { DialogTrigger as DialogTrigger$1, ModalOverlay, Modal, Dialog as Dialog$1, Heading } from 'react-aria-components';
import { XIcon } from 'lucide-react';
import { jsx, jsxs } from 'react/jsx-runtime';

function DialogTrigger({ ...props }) {
  return /* @__PURE__ */ jsx(DialogTrigger$1, { "data-slot": "dialog-trigger", ...props });
}
function DialogClose({
  className,
  variant = "outline",
  size = "default",
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Button,
    {
      slot: "close",
      "data-slot": "dialog-close",
      variant,
      size,
      className: cn(className),
      ...props
    }
  );
}
function DialogOverlay({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ModalOverlay,
    {
      "data-slot": "dialog-overlay",
      className: cn(
        "fixed inset-0 isolate z-50 bg-black/30 duration-100 data-entering:animate-in data-entering:fade-in-0 data-exiting:animate-out data-exiting:fade-out-0 supports-backdrop-filter:backdrop-blur-sm",
        className
      ),
      ...props,
      children
    }
  );
}
function Dialog({
  className,
  children,
  showCloseButton = true,
  isDismissable = true,
  ...props
}) {
  return /* @__PURE__ */ jsx(DialogOverlay, { isDismissable, ...props, children: /* @__PURE__ */ jsx(
    Modal,
    {
      "data-slot": "dialog-content",
      className: cn(
        "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-lg border border-border bg-popover p-6 text-sm text-popover-foreground shadow-[0_2px_0_0_var(--border)] duration-100 outline-none data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 sm:max-w-lg",
        className
      ),
      children: /* @__PURE__ */ jsxs(
        Dialog$1,
        {
          "data-slot": "dialog",
          className: "[display:inherit] [gap:inherit] outline-none",
          children: [
            children,
            showCloseButton && /* @__PURE__ */ jsx(
              DialogClose,
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
function DialogHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "dialog-header",
      className: cn("flex flex-col gap-1.5", className),
      ...props
    }
  );
}
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      "data-slot": "dialog-footer",
      className: cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      ),
      ...props,
      children: [
        children,
        showCloseButton && /* @__PURE__ */ jsx(DialogClose, { variant: "outline", children: "Close" })
      ]
    }
  );
}
function DialogTitle({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Heading,
    {
      slot: "title",
      "data-slot": "dialog-title",
      className: cn(
        "font-heading text-lg leading-none font-semibold",
        className
      ),
      ...props
    }
  );
}
function DialogDescription({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "dialog-description",
      className: cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      ),
      ...props
    }
  );
}

export { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogTitle, DialogTrigger };
//# sourceMappingURL=chunk-A33IINYN.js.map
//# sourceMappingURL=chunk-A33IINYN.js.map