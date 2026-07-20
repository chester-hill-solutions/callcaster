import * as React from 'react';
import { ModalOverlayProps, Modal, Heading, DialogTriggerProps } from 'react-aria-components';
import { Button } from './button.js';
import 'class-variance-authority/types';
import 'class-variance-authority';

declare function AlertDialogTrigger({ ...props }: DialogTriggerProps): React.JSX.Element;
declare function AlertDialogOverlay({ className, children, ...props }: Omit<ModalOverlayProps, "className" | "children"> & {
    className?: string;
    children: React.ReactNode;
}): React.JSX.Element;
declare function AlertDialog({ className, size, children, ...props }: Omit<ModalOverlayProps, "className" | "children"> & Pick<React.ComponentProps<typeof Modal>, "isDismissable"> & {
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

export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogOverlay, AlertDialogTitle, AlertDialogTrigger };
