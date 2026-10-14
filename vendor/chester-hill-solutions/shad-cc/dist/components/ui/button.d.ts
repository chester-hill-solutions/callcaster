import type * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { type ButtonProps as ButtonPrimitiveProps, type LinkProps as LinkPrimitiveProps } from "react-aria-components";
declare const buttonVariants: (props?: ({
    variant?: "link" | "default" | "destructive" | "outline" | "secondary" | "ghost" | null | undefined;
    size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function Button({ className, variant, size, ...props }: Omit<ButtonPrimitiveProps, "className"> & React.RefAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & {
    className?: string;
}): React.JSX.Element;
declare function LinkButton({ className, variant, size, ...props }: Omit<LinkPrimitiveProps, "className"> & VariantProps<typeof buttonVariants> & {
    className?: string;
}): React.JSX.Element;
export { Button, LinkButton, buttonVariants };
