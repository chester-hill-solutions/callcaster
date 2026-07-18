import * as React from 'react';
import { ModalOverlayProps, Modal, Heading, DialogTriggerProps } from 'react-aria-components';
export { DialogProps as DialogPrimitiveProps, DialogTriggerProps as DialogTriggerPrimitiveProps } from 'react-aria-components';
import { Button } from './button.js';
import 'class-variance-authority/types';
import 'class-variance-authority';

declare function DialogTrigger({ ...props }: DialogTriggerProps): React.JSX.Element;
declare function DialogClose({ className, variant, size, ...props }: React.ComponentProps<typeof Button>): React.JSX.Element;
declare function DialogOverlay({ className, children, ...props }: Omit<ModalOverlayProps, "className" | "children"> & {
    className?: string;
    children: React.ReactNode;
}): React.JSX.Element;
declare function Dialog({ className, children, showCloseButton, isDismissable, ...props }: Omit<ModalOverlayProps, "className" | "children"> & Pick<React.ComponentProps<typeof Modal>, "isDismissable"> & {
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

export { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogTitle, DialogTrigger };
