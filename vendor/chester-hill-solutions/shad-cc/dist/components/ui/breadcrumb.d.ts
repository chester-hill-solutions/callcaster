import * as React from 'react';
import { BreadcrumbProps, LinkProps, BreadcrumbsProps } from 'react-aria-components';

declare function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">): React.JSX.Element;
declare function BreadcrumbList<T extends object>({ className, ...props }: BreadcrumbsProps<T>): React.JSX.Element;
declare function BreadcrumbItem({ className, children, separatorClassName, ...props }: BreadcrumbProps & {
    separatorClassName?: string;
}): React.JSX.Element;
declare function BreadcrumbLink({ className, render, ...props }: LinkProps): React.JSX.Element;
declare function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element;
declare function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element;

export { Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage };
