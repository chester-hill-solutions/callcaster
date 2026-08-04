import * as React from "react";

import {
  Sheet as ShadSheet,
  SheetClose,
  SheetContent as ShadSheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger as ShadSheetTrigger,
} from "@chester-hill-solutions/shad-cc/sheet";

type SheetRootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

/** Radix-shaped Sheet root → React Aria DialogTrigger. */
function Sheet({ open, defaultOpen, onOpenChange, children }: SheetRootProps) {
  return (
    <ShadSheetTrigger
      isOpen={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {children}
    </ShadSheetTrigger>
  );
}

type SheetTriggerProps = {
  asChild?: boolean;
  children?: React.ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

function SheetTrigger({ asChild, children, ...props }: SheetTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    return children;
  }
  return (
    <button type="button" {...props}>
      {children}
    </button>
  );
}

function SheetContent(
  props: React.ComponentProps<typeof ShadSheetContent>,
) {
  return <ShadSheetContent {...props} />;
}

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetClose,
  ShadSheet as SheetPanel,
};
