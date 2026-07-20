import { Button } from './chunk-727NWYDA.js';
import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { DialogTrigger, ModalOverlay, Modal, Dialog, Heading } from 'react-aria-components';
import { jsx } from 'react/jsx-runtime';

function AlertDialogTrigger({ ...props }) {
  return /* @__PURE__ */ jsx(DialogTrigger, { "data-slot": "alert-dialog-trigger", ...props });
}
function AlertDialogOverlay({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ModalOverlay,
    {
      "data-slot": "alert-dialog-overlay",
      className: cn(
        "fixed inset-0 isolate z-50 bg-black/30 duration-100 data-entering:animate-in data-entering:fade-in-0 data-exiting:animate-out data-exiting:fade-out-0 supports-backdrop-filter:backdrop-blur-sm",
        className
      ),
      ...props,
      children
    }
  );
}
function AlertDialog({
  className,
  size = "default",
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(AlertDialogOverlay, { ...props, children: /* @__PURE__ */ jsx(
    Modal,
    {
      "data-slot": "alert-dialog-content",
      "data-size": size,
      className: cn(
        "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-6 rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-[0_2px_0_0_var(--border)] duration-100 outline-none data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-md",
        className
      ),
      children: /* @__PURE__ */ jsx(
        Dialog,
        {
          "data-slot": "alert-dialog",
          role: "alertdialog",
          className: "[display:inherit] [gap:inherit] outline-none",
          children
        }
      )
    }
  ) });
}
function AlertDialogContent({
  className,
  size = "default",
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(AlertDialog, { className, size, ...props, children });
}
function AlertDialogHeader({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert-dialog-header",
      className: cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      ),
      ...props
    }
  );
}
function AlertDialogFooter({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert-dialog-footer",
      className: cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      ),
      ...props
    }
  );
}
function AlertDialogMedia({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert-dialog-media",
      className: cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md border border-secondary bg-brand-wash sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className
      ),
      ...props
    }
  );
}
function AlertDialogTitle({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Heading,
    {
      slot: "title",
      "data-slot": "alert-dialog-title",
      className: cn(
        "font-heading text-lg font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      ),
      ...props
    }
  );
}
function AlertDialogDescription({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert-dialog-description",
      className: cn(
        "text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      ),
      ...props
    }
  );
}
function AlertDialogAction({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Button,
    {
      slot: "close",
      "data-slot": "alert-dialog-action",
      className: cn(className),
      ...props
    }
  );
}
function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Button,
    {
      slot: "close",
      "data-slot": "alert-dialog-cancel",
      className: cn(className),
      variant,
      size,
      ...props
    }
  );
}

export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogOverlay, AlertDialogTitle, AlertDialogTrigger };
//# sourceMappingURL=chunk-JETLZKWV.js.map
//# sourceMappingURL=chunk-JETLZKWV.js.map