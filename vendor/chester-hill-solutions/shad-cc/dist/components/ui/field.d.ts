import * as class_variance_authority_types from 'class-variance-authority/types';
import * as React from 'react';
import { ComponentProps, ReactNode } from 'react';
import { VariantProps } from 'class-variance-authority';
import { Label } from './label.js';
import 'react-aria-components';

declare function FieldSet({ className, ...props }: ComponentProps<"fieldset">): React.JSX.Element;
declare function FieldLegend({ className, variant, ...props }: ComponentProps<"legend"> & {
    variant?: "legend" | "label";
}): React.JSX.Element;
declare function FieldGroup({ className, ...props }: ComponentProps<"div">): React.JSX.Element;
declare const fieldVariants: (props?: ({
    orientation?: "horizontal" | "vertical" | "responsive" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare function Field({ className, orientation, ...props }: ComponentProps<"div"> & VariantProps<typeof fieldVariants>): React.JSX.Element;
declare function FieldContent({ className, ...props }: ComponentProps<"div">): React.JSX.Element;
declare function FieldLabel({ className, ...props }: ComponentProps<typeof Label>): React.JSX.Element;
declare function FieldTitle({ className, ...props }: ComponentProps<"div">): React.JSX.Element;
declare function FieldDescription({ className, ...props }: ComponentProps<"p">): React.JSX.Element;
declare function FieldSeparator({ children, className, ...props }: ComponentProps<"div"> & {
    children?: ReactNode;
}): React.JSX.Element;
declare function FieldError({ className, children, errors, ...props }: ComponentProps<"div"> & {
    errors?: Array<{
        message?: string;
    } | undefined>;
}): React.JSX.Element | null;

export { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet, FieldTitle };
