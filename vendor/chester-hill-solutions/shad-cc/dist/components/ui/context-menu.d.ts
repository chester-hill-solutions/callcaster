import * as React from 'react';
import { Menu, Popover, MenuSectionProps, MenuItemProps, Header, Separator, SubmenuTrigger, MenuTriggerProps } from 'react-aria-components';

declare function ContextMenu({ "data-slot": dataSlot, placement, offset, crossOffset, className, children, ...props }: Omit<React.ComponentProps<typeof Menu<object>>, "children" | "className"> & Pick<React.ComponentProps<typeof Popover>, "placement" | "offset" | "crossOffset"> & {
    "data-slot"?: string;
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element;
declare function ContextMenuTrigger({ children, className, onOpenChange, ...props }: Omit<MenuTriggerProps, "trigger" | "isOpen" | "defaultOpen"> & {
    className?: string;
}): React.JSX.Element;
declare function ContextMenuGroup({ ...props }: Omit<MenuSectionProps<object>, "children"> & {
    children?: React.ReactNode;
}): React.JSX.Element;
declare function ContextMenuLabel({ className, inset, ...props }: React.ComponentProps<typeof Header> & {
    inset?: boolean;
}): React.JSX.Element;
declare function ContextMenuItem({ className, inset, variant, children, ...props }: MenuItemProps<object> & {
    inset?: boolean;
    variant?: "default" | "destructive";
}): React.JSX.Element;
declare function ContextMenuSub({ ...props }: React.ComponentProps<typeof SubmenuTrigger>): React.JSX.Element;
declare function ContextMenuSubTrigger({ className, inset, children, ...props }: MenuItemProps<object> & {
    inset?: boolean;
}): React.JSX.Element;
declare function ContextMenuSubContent({ placement, crossOffset, offset, className, ...props }: React.ComponentProps<typeof ContextMenu>): React.JSX.Element;
declare function ContextMenuSeparator({ className, ...props }: React.ComponentProps<typeof Separator>): React.JSX.Element;
declare function ContextMenuShortcut({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element;

export { ContextMenu, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger };
