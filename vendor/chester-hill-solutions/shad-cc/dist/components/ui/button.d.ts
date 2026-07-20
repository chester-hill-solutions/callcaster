import * as class_variance_authority_types from 'class-variance-authority/types';
import * as React from 'react';
import { VariantProps } from 'class-variance-authority';
import { ButtonProps, LinkProps } from 'react-aria-components';

declare const buttonVariants: (props?: ({
    variant?: "link" | "default" | "destructive" | "outline" | "secondary" | "ghost" | null | undefined;
    size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare function Button({ className, variant, size, ...props }: Omit<ButtonProps, "className"> & React.RefAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & {
    className?: string;
}): React.JSX.Element;
declare function LinkButton({ className, variant, size, ...props }: Omit<LinkProps, "className"> & VariantProps<typeof buttonVariants> & {
    className?: string;
}): React.JSX.Element;

export { Button, LinkButton, buttonVariants };
