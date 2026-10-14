import * as React from "react";
import { Header as HeaderPrimitive, Menu as MenuPrimitive, MenuTrigger as MenuTriggerPrimitive, Popover as PopoverPrimitive, Separator as SeparatorPrimitive, SubmenuTrigger as SubmenuTriggerPrimitive, type MenuItemProps as MenuItemPrimitiveProps, type MenuSectionProps as MenuSectionPrimitiveProps } from "react-aria-components";
declare function DropdownMenuTrigger({ ...props }: React.ComponentProps<typeof MenuTriggerPrimitive>): React.JSX.Element;
declare function DropdownMenu({ "data-slot": dataSlot, placement, offset, crossOffset, className, children, ...props }: Omit<React.ComponentProps<typeof MenuPrimitive<object>>, "children" | "className"> & Pick<React.ComponentProps<typeof PopoverPrimitive>, "placement" | "offset" | "crossOffset"> & {
    "data-slot"?: string;
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element;
declare function DropdownMenuGroup({ ...props }: Omit<MenuSectionPrimitiveProps<object>, "children"> & {
    children?: React.ReactNode;
}): React.JSX.Element;
declare function DropdownMenuLabel({ className, inset, ...props }: React.ComponentProps<typeof HeaderPrimitive> & {
    inset?: boolean;
}): React.JSX.Element;
declare function DropdownMenuItem({ className, inset, variant, children, ...props }: MenuItemPrimitiveProps<object> & {
    inset?: boolean;
    variant?: "default" | "destructive";
}): React.JSX.Element;
declare function DropdownMenuSub({ ...props }: React.ComponentProps<typeof SubmenuTriggerPrimitive>): React.JSX.Element;
declare function DropdownMenuSubTrigger({ className, inset, children, ...props }: MenuItemPrimitiveProps<object> & {
    inset?: boolean;
}): React.JSX.Element;
declare function DropdownMenuSubContent({ placement, crossOffset, offset, className, ...props }: React.ComponentProps<typeof DropdownMenu>): React.JSX.Element;
declare function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof SeparatorPrimitive>): React.JSX.Element;
declare function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element;
export { DropdownMenuTrigger, DropdownMenu, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, };
