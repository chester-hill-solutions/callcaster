import * as class_variance_authority_types from 'class-variance-authority/types';
import * as React from 'react';
import { VariantProps } from 'class-variance-authority';
import { GroupProps } from 'react-aria-components';
import { Button } from './button.js';

declare function InputGroup({ className, ...props }: GroupProps): React.JSX.Element;
declare const inputGroupAddonVariants: (props?: ({
    align?: "inline-start" | "inline-end" | "block-start" | "block-end" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare function InputGroupAddon({ className, align, ...props }: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>): React.JSX.Element;
declare const inputGroupButtonVariants: (props?: ({
    size?: "xs" | "sm" | "icon-xs" | "icon-sm" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare function InputGroupButton({ className, type, variant, size, ...props }: Omit<React.ComponentProps<typeof Button>, "size" | "type"> & VariantProps<typeof inputGroupButtonVariants> & {
    type?: "button" | "submit" | "reset";
}): React.JSX.Element;
declare function InputGroupText({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element;
declare function InputGroupInput({ className, ...props }: React.ComponentProps<"input">): React.JSX.Element;
declare function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">): React.JSX.Element;

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea };
