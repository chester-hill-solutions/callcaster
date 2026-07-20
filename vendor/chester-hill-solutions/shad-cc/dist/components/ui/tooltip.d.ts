import * as React from 'react';
import { Tooltip as Tooltip$1, TooltipTrigger as TooltipTrigger$1 } from 'react-aria-components';

declare function TooltipTrigger({ delay, children, ...props }: React.ComponentProps<typeof TooltipTrigger$1>): React.JSX.Element;
declare function Tooltip({ className, placement, offset, crossOffset, children, ...props }: Omit<React.ComponentProps<typeof Tooltip$1>, "children" | "className"> & {
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element;

export { Tooltip, TooltipTrigger };
