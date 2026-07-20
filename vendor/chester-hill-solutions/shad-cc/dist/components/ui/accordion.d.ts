import * as React from 'react';
import { DisclosureGroupProps, DisclosurePanelProps, DisclosureProps, ButtonProps } from 'react-aria-components';

declare function Accordion({ className, ...props }: DisclosureGroupProps): React.JSX.Element;
declare function AccordionItem({ className, ...props }: DisclosureProps): React.JSX.Element;
declare function AccordionTrigger({ className, children, ...props }: Omit<ButtonProps, "children"> & {
    children: React.ReactNode;
}): React.JSX.Element;
declare function AccordionContent({ className, children, ...props }: DisclosurePanelProps): React.JSX.Element;

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
