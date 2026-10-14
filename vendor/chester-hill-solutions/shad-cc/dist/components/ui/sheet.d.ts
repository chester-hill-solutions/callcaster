import * as React from "react";
import { Heading, Modal as ModalPrimitive, type ModalOverlayProps as ModalOverlayPrimitiveProps, type DialogProps as SheetPrimitiveProps, type DialogTriggerProps as SheetTriggerPrimitiveProps } from "react-aria-components";
import { Button } from "./button";
declare function SheetTrigger({ ...props }: SheetTriggerPrimitiveProps): React.JSX.Element;
declare function SheetClose({ className, variant, size, ...props }: React.ComponentProps<typeof Button>): React.JSX.Element;
declare function Sheet({ className, children, side, showCloseButton, ...props }: Omit<ModalOverlayPrimitiveProps, "className" | "children"> & Pick<React.ComponentProps<typeof ModalPrimitive>, "isDismissable"> & {
    className?: string;
    children: React.ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    showCloseButton?: boolean;
}): React.JSX.Element;
declare function SheetContent({ className, children, side, showCloseButton, ...props }: React.ComponentProps<typeof Sheet> & {
    side?: "top" | "right" | "bottom" | "left";
    showCloseButton?: boolean;
}): React.JSX.Element;
declare function SheetHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function SheetFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function SheetTitle({ className, ...props }: Omit<React.ComponentProps<typeof Heading>, "slot">): React.JSX.Element;
declare function SheetDescription({ className, ...props }: Omit<React.ComponentProps<"div">, "slot">): React.JSX.Element;
export { type SheetPrimitiveProps, type SheetTriggerPrimitiveProps, Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, };
