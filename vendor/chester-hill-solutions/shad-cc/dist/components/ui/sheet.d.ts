import * as React from 'react';
import { ModalOverlayProps, Modal, Heading, DialogTriggerProps } from 'react-aria-components';
export { DialogProps as SheetPrimitiveProps, DialogTriggerProps as SheetTriggerPrimitiveProps } from 'react-aria-components';
import { Button } from './button.js';
import 'class-variance-authority/types';
import 'class-variance-authority';

declare function SheetTrigger({ ...props }: DialogTriggerProps): React.JSX.Element;
declare function SheetClose({ className, variant, size, ...props }: React.ComponentProps<typeof Button>): React.JSX.Element;
declare function Sheet({ className, children, side, showCloseButton, ...props }: Omit<ModalOverlayProps, "className" | "children"> & Pick<React.ComponentProps<typeof Modal>, "isDismissable"> & {
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

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
