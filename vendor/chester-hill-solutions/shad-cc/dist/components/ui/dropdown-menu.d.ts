import * as React from 'react';
import { Menu, Popover, MenuSectionProps, MenuItemProps, Header, Separator, SubmenuTrigger, MenuTrigger } from 'react-aria-components';

declare function DropdownMenuTrigger({ ...props }: React.ComponentProps<typeof MenuTrigger>): React.JSX.Element;
declare function DropdownMenu({ "data-slot": dataSlot, placement, offset, crossOffset, className, children, ...props }: Omit<React.ComponentProps<typeof Menu<object>>, "children" | "className"> & Pick<React.ComponentProps<typeof Popover>, "placement" | "offset" | "crossOffset"> & {
    "data-slot"?: string;
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element;
declare function DropdownMenuGroup({ ...props }: Omit<MenuSectionProps<object>, "children"> & {
    children?: React.ReactNode;
}): React.JSX.Element;
declare function DropdownMenuLabel({ className, inset, ...props }: React.ComponentProps<typeof Header> & {
    inset?: boolean;
}): React.JSX.Element;
declare function DropdownMenuItem({ className, inset, variant, children, ...props }: MenuItemProps<object> & {
    inset?: boolean;
    variant?: "default" | "destructive";
}): React.JSX.Element;
declare function DropdownMenuSub({ ...props }: React.ComponentProps<typeof SubmenuTrigger>): React.JSX.Element;
declare function DropdownMenuSubTrigger({ className, inset, children, ...props }: MenuItemProps<object> & {
    inset?: boolean;
}): React.JSX.Element;
declare function DropdownMenuSubContent({ placement, crossOffset, offset, className, ...props }: React.ComponentProps<typeof DropdownMenu>): React.JSX.Element;
declare function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Separator>): React.JSX.Element;
declare function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element;

export { DropdownMenu, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger };
