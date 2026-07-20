import * as class_variance_authority_types from 'class-variance-authority/types';
import * as React from 'react';
import { VariantProps } from 'class-variance-authority';
import { Tabs as Tabs$1, TabPanel, TabList, Tab } from 'react-aria-components';

declare function Tabs({ className, ...props }: React.ComponentProps<typeof Tabs$1>): React.JSX.Element;
declare const tabsListVariants: (props?: ({
    variant?: "default" | "line" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare function TabsList({ className, variant, ...props }: React.ComponentProps<typeof TabList> & VariantProps<typeof tabsListVariants>): React.JSX.Element;
declare function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Tab>): React.JSX.Element;
declare function TabsContent({ className, ...props }: React.ComponentProps<typeof TabPanel>): React.JSX.Element;

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
