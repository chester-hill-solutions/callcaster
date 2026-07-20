import * as React$1 from 'react';
import * as class_variance_authority_types from 'class-variance-authority/types';
import { VariantProps } from 'class-variance-authority';
import { Separator } from './separator.js';
import 'react-aria-components';

declare const buttonGroupVariants: (props?: ({
    orientation?: "horizontal" | "vertical" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare function ButtonGroup({ className, orientation, ...props }: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>): React$1.JSX.Element;
declare function ButtonGroupText({ className, render, ...props }: React.ComponentProps<"div"> & {
    render?: (props: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}): string | number | bigint | boolean | React$1.JSX.Element | Iterable<React$1.ReactNode> | Promise<string | number | bigint | boolean | React$1.ReactPortal | React$1.ReactElement<unknown, string | React$1.JSXElementConstructor<any>> | Iterable<React$1.ReactNode> | null | undefined> | null | undefined;
declare function ButtonGroupSeparator({ className, orientation, ...props }: React.ComponentProps<typeof Separator>): React$1.JSX.Element;

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };
