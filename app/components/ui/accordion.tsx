import * as React from "react";

import {
  Accordion as ShadAccordion,
  AccordionContent,
  AccordionItem as ShadAccordionItem,
  AccordionTrigger,
} from "@chester-hill-solutions/shad-cc/accordion";

type AccordionProps = {
  type?: "single" | "multiple";
  collapsible?: boolean;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children?: React.ReactNode;
};

function Accordion({
  type = "single",
  collapsible: _collapsible,
  value,
  defaultValue,
  onValueChange,
  ...props
}: AccordionProps) {
  return (
    <ShadAccordion
      allowsMultipleExpanded={type === "multiple"}
      expandedKeys={value != null ? new Set([value]) : undefined}
      defaultExpandedKeys={
        defaultValue != null ? new Set([defaultValue]) : undefined
      }
      onExpandedChange={(keys) => {
        const first = [...keys][0];
        if (first != null) onValueChange?.(String(first));
      }}
      {...props}
    />
  );
}

type AccordionItemProps = Omit<
  React.ComponentProps<typeof ShadAccordionItem>,
  "id"
> & {
  value: string;
};

function AccordionItem({ value, ...props }: AccordionItemProps) {
  return <ShadAccordionItem id={value} {...props} />;
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
