import * as React from 'react';
import { Drawer as Drawer$1 } from '@base-ui/react/drawer';

declare function Drawer({ modal, showSwipeHandle, snapPoints, swipeDirection, ...props }: Drawer$1.Root.Props & {
    showSwipeHandle?: boolean;
}): React.JSX.Element;
declare function DrawerTrigger({ ...props }: Drawer$1.Trigger.Props): React.JSX.Element;
declare function DrawerPortal({ ...props }: Drawer$1.Portal.Props): React.JSX.Element;
declare function DrawerClose({ ...props }: Drawer$1.Close.Props): React.JSX.Element;
declare function DrawerOverlay({ className, ...props }: Drawer$1.Backdrop.Props): React.JSX.Element;
declare function DrawerSwipeHandle({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function DrawerContent({ className, children, ...props }: Drawer$1.Popup.Props): React.JSX.Element;
declare function DrawerHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function DrawerFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function DrawerTitle({ className, ...props }: Drawer$1.Title.Props): React.JSX.Element;
declare function DrawerDescription({ className, ...props }: Drawer$1.Description.Props): React.JSX.Element;

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerOverlay, DrawerPortal, DrawerSwipeHandle, DrawerTitle, DrawerTrigger };
