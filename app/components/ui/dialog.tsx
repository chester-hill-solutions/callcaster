import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import {
  Dialog as ShadDialog,
  DialogClose as ShadDialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle as ShadDialogTitle,
  DialogTrigger as ShadDialogTrigger,
} from "@chester-hill-solutions/shad-cc/dialog";

type DialogRootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

/**
 * Radix-shaped Dialog root mapped onto React Aria DialogTrigger.
 * Children order: pressable trigger, then DialogContent (modal body).
 */
function Dialog({ open, defaultOpen, onOpenChange, children }: DialogRootProps) {
  return (
    <ShadDialogTrigger
      isOpen={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {children}
    </ShadDialogTrigger>
  );
}

type DialogTriggerProps = {
  asChild?: boolean;
  children?: React.ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

function DialogTrigger({ asChild, children, ...props }: DialogTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    return children;
  }
  return (
    <button type="button" {...props}>
      {children}
    </button>
  );
}

type DialogContentProps = React.ComponentProps<typeof ShadDialog>;

function DialogContent({ children, ...props }: DialogContentProps) {
  return <ShadDialog {...props}>{children}</ShadDialog>;
}

type DialogTitleProps = React.ComponentProps<typeof ShadDialogTitle> & {
  asChild?: boolean;
};

function DialogTitle({
  asChild,
  children,
  className,
  ...props
}: DialogTitleProps) {
  if (asChild && React.isValidElement(children)) {
    return (
      <Slot className={className} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <ShadDialogTitle className={className} {...props}>
      {children}
    </ShadDialogTitle>
  );
}

type DialogCloseProps = React.ComponentProps<typeof ShadDialogClose> & {
  asChild?: boolean;
};

function DialogClose({ asChild, children, ...props }: DialogCloseProps) {
  if (asChild && React.isValidElement(children)) {
    return <ShadDialogClose {...props}>{children}</ShadDialogClose>;
  }
  return <ShadDialogClose {...props}>{children}</ShadDialogClose>;
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogOverlay,
};
