import * as React from "react";
import { Heading, Modal as ModalPrimitive, type DialogTriggerProps as AlertDialogTriggerPrimitiveProps, type ModalOverlayProps as ModalOverlayPrimitiveProps } from "react-aria-components";
import { Button } from "./button";
declare function AlertDialogTrigger({ ...props }: AlertDialogTriggerPrimitiveProps): React.JSX.Element;
declare function AlertDialogOverlay({ className, children, ...props }: Omit<ModalOverlayPrimitiveProps, "className" | "children"> & {
    className?: string;
    children: React.ReactNode;
}): React.JSX.Element;
declare function AlertDialog({ className, size, children, ...props }: Omit<ModalOverlayPrimitiveProps, "className" | "children"> & Pick<React.ComponentProps<typeof ModalPrimitive>, "isDismissable"> & {
    className?: string;
    size?: "default" | "sm";
    children: React.ReactNode;
}): React.JSX.Element;
declare function AlertDialogContent({ className, size, children, ...props }: React.ComponentProps<typeof AlertDialog>): React.JSX.Element;
declare function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function AlertDialogMedia({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function AlertDialogTitle({ className, ...props }: Omit<React.ComponentProps<typeof Heading>, "slot">): React.JSX.Element;
declare function AlertDialogDescription({ className, ...props }: Omit<React.ComponentProps<"div">, "slot">): React.JSX.Element;
declare function AlertDialogAction({ className, ...props }: React.ComponentProps<typeof Button>): React.JSX.Element;
declare function AlertDialogCancel({ className, variant, size, ...props }: React.ComponentProps<typeof Button>): React.JSX.Element;
export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogOverlay, AlertDialogTitle, AlertDialogTrigger, };
