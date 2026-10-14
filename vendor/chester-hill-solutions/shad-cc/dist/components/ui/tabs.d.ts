import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { TabList as TabListPrimitive, TabPanel as TabPanelPrimitive, Tab as TabPrimitive, Tabs as TabsPrimitive } from "react-aria-components";
declare function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive>): React.JSX.Element;
declare const tabsListVariants: (props?: ({
    variant?: "default" | "line" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function TabsList({ className, variant, ...props }: React.ComponentProps<typeof TabListPrimitive> & VariantProps<typeof tabsListVariants>): React.JSX.Element;
declare function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabPrimitive>): React.JSX.Element;
declare function TabsContent({ className, ...props }: React.ComponentProps<typeof TabPanelPrimitive>): React.JSX.Element;
export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
