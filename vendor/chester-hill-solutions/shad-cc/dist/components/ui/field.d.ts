import { type ComponentProps, type ReactNode } from "react";
import { type VariantProps } from "class-variance-authority";
import { Label } from "./label";
declare function FieldSet({ className, ...props }: ComponentProps<"fieldset">): import("react").JSX.Element;
declare function FieldLegend({ className, variant, ...props }: ComponentProps<"legend"> & {
    variant?: "legend" | "label";
}): import("react").JSX.Element;
declare function FieldGroup({ className, ...props }: ComponentProps<"div">): import("react").JSX.Element;
declare const fieldVariants: (props?: ({
    orientation?: "horizontal" | "vertical" | "responsive" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function Field({ className, orientation, ...props }: ComponentProps<"div"> & VariantProps<typeof fieldVariants>): import("react").JSX.Element;
declare function FieldContent({ className, ...props }: ComponentProps<"div">): import("react").JSX.Element;
declare function FieldLabel({ className, ...props }: ComponentProps<typeof Label>): import("react").JSX.Element;
declare function FieldTitle({ className, ...props }: ComponentProps<"div">): import("react").JSX.Element;
declare function FieldDescription({ className, ...props }: ComponentProps<"p">): import("react").JSX.Element;
declare function FieldSeparator({ children, className, ...props }: ComponentProps<"div"> & {
    children?: ReactNode;
}): import("react").JSX.Element;
declare function FieldError({ className, children, errors, ...props }: ComponentProps<"div"> & {
    errors?: Array<{
        message?: string;
    } | undefined>;
}): import("react").JSX.Element | null;
export { Field, FieldLabel, FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSeparator, FieldSet, FieldContent, FieldTitle, };
