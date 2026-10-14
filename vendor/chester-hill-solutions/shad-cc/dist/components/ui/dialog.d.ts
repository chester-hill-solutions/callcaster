import * as React from "react";
import { Heading, Modal as ModalPrimitive, type DialogProps as DialogPrimitiveProps, type DialogTriggerProps as DialogTriggerPrimitiveProps, type ModalOverlayProps as ModalOverlayPrimitiveProps } from "react-aria-components";
import { Button } from "./button";
declare function DialogTrigger({ ...props }: DialogTriggerPrimitiveProps): React.JSX.Element;
declare function DialogClose({ className, variant, size, ...props }: React.ComponentProps<typeof Button>): React.JSX.Element;
declare function DialogOverlay({ className, children, ...props }: Omit<ModalOverlayPrimitiveProps, "className" | "children"> & {
    className?: string;
    children: React.ReactNode;
}): React.JSX.Element;
declare function Dialog({ className, children, showCloseButton, isDismissable, ...props }: Omit<ModalOverlayPrimitiveProps, "className" | "children"> & Pick<React.ComponentProps<typeof ModalPrimitive>, "isDismissable"> & {
    className?: string;
    children: React.ReactNode;
    showCloseButton?: boolean;
}): React.JSX.Element;
declare function DialogHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function DialogFooter({ className, showCloseButton, children, ...props }: React.ComponentProps<"div"> & {
    showCloseButton?: boolean;
}): React.JSX.Element;
declare function DialogTitle({ className, ...props }: Omit<React.ComponentProps<typeof Heading>, "slot">): React.JSX.Element;
declare function DialogDescription({ className, ...props }: Omit<React.ComponentProps<"div">, "slot">): React.JSX.Element;
export { type DialogPrimitiveProps, type DialogTriggerPrimitiveProps, Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogTitle, DialogTrigger, };
