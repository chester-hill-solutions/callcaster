import * as class_variance_authority_types from 'class-variance-authority/types';
import * as React$1 from 'react';
import { VariantProps } from 'class-variance-authority';

declare function Empty({ className, ...props }: React.ComponentProps<"div">): React$1.JSX.Element;
declare function EmptyHeader({ className, ...props }: React.ComponentProps<"div">): React$1.JSX.Element;
declare const emptyMediaVariants: (props?: ({
    variant?: "default" | "icon" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare function EmptyMedia({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>): React$1.JSX.Element;
declare function EmptyTitle({ className, ...props }: React.ComponentProps<"div">): React$1.JSX.Element;
declare function EmptyDescription({ className, ...props }: React.ComponentProps<"p">): React$1.JSX.Element;
declare function EmptyContent({ className, ...props }: React.ComponentProps<"div">): React$1.JSX.Element;

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
