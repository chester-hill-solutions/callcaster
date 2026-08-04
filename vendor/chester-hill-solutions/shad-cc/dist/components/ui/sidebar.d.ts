import * as class_variance_authority_types from 'class-variance-authority/types';
import * as React from 'react';
import { VariantProps } from 'class-variance-authority';
import { ButtonProps, LinkProps } from 'react-aria-components';
import { Button } from './button.js';
import { Input } from './input.js';
import { Separator } from './separator.js';
import { Tooltip } from './tooltip.js';

type SidebarContextProps = {
    state: "expanded" | "collapsed";
    open: boolean;
    setOpen: (open: boolean) => void;
    openMobile: boolean;
    setOpenMobile: (open: boolean) => void;
    isMobile: boolean;
    toggleSidebar: () => void;
};
type SidebarButtonProps = (LinkProps & {
    href: string;
}) | (ButtonProps & {
    href?: never;
});
declare function useSidebar(): SidebarContextProps;
declare function SidebarProvider({ defaultOpen, open: openProp, onOpenChange: setOpenProp, className, style, children, ...props }: React.ComponentProps<"div"> & {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}): React.JSX.Element;
declare function Sidebar({ side, variant, collapsible, className, children, dir, ...props }: React.ComponentProps<"div"> & {
    side?: "left" | "right";
    variant?: "sidebar" | "floating" | "inset";
    collapsible?: "offcanvas" | "icon" | "none";
}): React.JSX.Element;
declare function SidebarTrigger({ className, onPress, ...props }: React.ComponentProps<typeof Button>): React.JSX.Element;
declare function SidebarRail({ className, ...props }: React.ComponentProps<"button">): React.JSX.Element;
declare function SidebarInset({ className, ...props }: React.ComponentProps<"main">): React.JSX.Element;
declare function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>): React.JSX.Element;
declare function SidebarHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function SidebarFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>): React.JSX.Element;
declare function SidebarContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function SidebarGroup({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function SidebarGroupLabel({ className, elementType: Element, ...props }: React.HTMLAttributes<HTMLElement> & {
    elementType?: React.ElementType;
}): React.JSX.Element;
declare function SidebarGroupAction({ className, ...props }: React.ComponentProps<"button">): React.JSX.Element;
declare function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function SidebarMenu({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function SidebarMenuItem({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare const sidebarMenuButtonVariants: (props?: ({
    variant?: "default" | "outline" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare function SidebarMenuButton({ isActive, variant, size, tooltip, className, ...props }: SidebarButtonProps & {
    isActive?: boolean;
    tooltip?: string | React.ComponentProps<typeof Tooltip>;
} & VariantProps<typeof sidebarMenuButtonVariants>): React.JSX.Element;
declare function SidebarMenuAction({ className, showOnHover, ...props }: ButtonProps & {
    showOnHover?: boolean;
}): React.JSX.Element;
declare function SidebarMenuBadge({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function SidebarMenuSkeleton({ className, showIcon, ...props }: React.ComponentProps<"div"> & {
    showIcon?: boolean;
}): React.JSX.Element;
declare function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">): React.JSX.Element;
declare function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<"li">): React.JSX.Element;
declare function SidebarMenuSubButton({ size, isActive, className, ...props }: SidebarButtonProps & {
    size?: "sm" | "md";
    isActive?: boolean;
}): React.JSX.Element;

export { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarInset, SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarRail, SidebarSeparator, SidebarTrigger, useSidebar };
