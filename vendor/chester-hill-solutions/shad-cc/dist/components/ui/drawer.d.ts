import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
declare function Drawer({ modal, showSwipeHandle, snapPoints, swipeDirection, ...props }: DrawerPrimitive.Root.Props & {
    showSwipeHandle?: boolean;
}): React.JSX.Element;
declare function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props): React.JSX.Element;
declare function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props): React.JSX.Element;
declare function DrawerClose({ ...props }: DrawerPrimitive.Close.Props): React.JSX.Element;
declare function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props): React.JSX.Element;
declare function DrawerSwipeHandle({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props): React.JSX.Element;
declare function DrawerHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function DrawerFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props): React.JSX.Element;
declare function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props): React.JSX.Element;
export { Drawer, DrawerPortal, DrawerOverlay, DrawerSwipeHandle, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription, };
