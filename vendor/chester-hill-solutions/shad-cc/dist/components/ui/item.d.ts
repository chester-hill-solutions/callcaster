import * as class_variance_authority_types from 'class-variance-authority/types';
import * as React from 'react';
import { VariantProps } from 'class-variance-authority';
import { LinkProps } from 'react-aria-components';
import { Separator } from './separator.js';

declare function ItemGroup({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function ItemSeparator({ className, ...props }: React.ComponentProps<typeof Separator>): React.JSX.Element;
declare const itemVariants: (props?: ({
    variant?: "default" | "outline" | "muted" | null | undefined;
    size?: "default" | "xs" | "sm" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare function Item({ className, variant, size, ...props }: Omit<LinkProps, "children"> & React.HTMLAttributes<HTMLElement> & VariantProps<typeof itemVariants>): React.JSX.Element;
declare const itemMediaVariants: (props?: ({
    variant?: "default" | "image" | "icon" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare function ItemMedia({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof itemMediaVariants>): React.JSX.Element;
declare function ItemContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function ItemTitle({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function ItemDescription({ className, ...props }: React.ComponentProps<"p">): React.JSX.Element;
declare function ItemActions({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function ItemHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function ItemFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;

export { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemHeader, ItemMedia, ItemSeparator, ItemTitle };
