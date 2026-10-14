import * as React from "react";
import { Header as HeaderPrimitive, Menu as MenuPrimitive, Popover as PopoverPrimitive, Separator as SeparatorPrimitive, SubmenuTrigger as SubmenuTriggerPrimitive, type MenuItemProps as MenuItemPrimitiveProps, type MenuSectionProps as MenuSectionPrimitiveProps, type MenuTriggerProps } from "react-aria-components";
declare function ContextMenu({ "data-slot": dataSlot, placement, offset, crossOffset, className, children, ...props }: Omit<React.ComponentProps<typeof MenuPrimitive<object>>, "children" | "className"> & Pick<React.ComponentProps<typeof PopoverPrimitive>, "placement" | "offset" | "crossOffset"> & {
    "data-slot"?: string;
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element;
declare function ContextMenuTrigger({ children, className, onOpenChange, ...props }: Omit<MenuTriggerProps, "trigger" | "isOpen" | "defaultOpen"> & {
    className?: string;
}): React.JSX.Element;
declare function ContextMenuGroup({ ...props }: Omit<MenuSectionPrimitiveProps<object>, "children"> & {
    children?: React.ReactNode;
}): React.JSX.Element;
declare function ContextMenuLabel({ className, inset, ...props }: React.ComponentProps<typeof HeaderPrimitive> & {
    inset?: boolean;
}): React.JSX.Element;
declare function ContextMenuItem({ className, inset, variant, children, ...props }: MenuItemPrimitiveProps<object> & {
    inset?: boolean;
    variant?: "default" | "destructive";
}): React.JSX.Element;
declare function ContextMenuSub({ ...props }: React.ComponentProps<typeof SubmenuTriggerPrimitive>): React.JSX.Element;
declare function ContextMenuSubTrigger({ className, inset, children, ...props }: MenuItemPrimitiveProps<object> & {
    inset?: boolean;
}): React.JSX.Element;
declare function ContextMenuSubContent({ placement, crossOffset, offset, className, ...props }: React.ComponentProps<typeof ContextMenu>): React.JSX.Element;
declare function ContextMenuSeparator({ className, ...props }: React.ComponentProps<typeof SeparatorPrimitive>): React.JSX.Element;
declare function ContextMenuShortcut({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element;
export { ContextMenu, ContextMenuTrigger, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuGroup, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, };
