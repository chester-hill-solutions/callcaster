import * as React from "react";
import type { Key } from "react-aria-components";

import {
  Tabs as ShadTabs,
  TabsContent as ShadTabsContent,
  TabsList,
  TabsTrigger as ShadTabsTrigger,
} from "@chester-hill-solutions/shad-cc/tabs";

type TabsProps = Omit<
  React.ComponentProps<typeof ShadTabs>,
  "selectedKey" | "defaultSelectedKey" | "onSelectionChange"
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

function Tabs({
  value,
  defaultValue,
  onValueChange,
  ...props
}: TabsProps) {
  return (
    <ShadTabs
      selectedKey={value}
      defaultSelectedKey={defaultValue}
      onSelectionChange={(key: Key) => {
        onValueChange?.(String(key));
      }}
      {...props}
    />
  );
}

type TabsTriggerProps = Omit<
  React.ComponentProps<typeof ShadTabsTrigger>,
  "id" | "isDisabled"
> & {
  value: string;
  disabled?: boolean;
  isDisabled?: boolean;
  asChild?: boolean;
  children?: React.ReactNode;
};

function TabsTrigger({
  value,
  disabled,
  isDisabled,
  asChild,
  children,
  ...props
}: TabsTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    return (
      <ShadTabsTrigger
        id={value}
        isDisabled={isDisabled ?? disabled}
        {...props}
      >
        {children}
      </ShadTabsTrigger>
    );
  }

  return (
    <ShadTabsTrigger
      id={value}
      isDisabled={isDisabled ?? disabled}
      {...props}
    >
      {children}
    </ShadTabsTrigger>
  );
}

type TabsContentProps = Omit<
  React.ComponentProps<typeof ShadTabsContent>,
  "id"
> & {
  value: string;
};

function TabsContent({ value, ...props }: TabsContentProps) {
  return <ShadTabsContent id={value} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
