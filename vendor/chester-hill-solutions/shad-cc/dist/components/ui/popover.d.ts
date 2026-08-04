import * as React from 'react';
import { PopoverProps, Heading, DialogTriggerProps } from 'react-aria-components';

declare function PopoverTrigger({ children, ...props }: DialogTriggerProps): React.JSX.Element;
declare function Popover({ className, placement, offset, crossOffset, ...props }: Omit<PopoverProps, "className"> & {
    className?: string;
}): React.JSX.Element;
declare function PopoverHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function PopoverTitle({ className, ...props }: React.ComponentProps<typeof Heading>): React.JSX.Element;
declare function PopoverDescription({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;

export { Popover, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
