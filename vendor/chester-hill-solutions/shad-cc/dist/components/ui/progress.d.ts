import * as React from 'react';
import { ProgressBarProps, LabelProps } from 'react-aria-components';

declare function Progress({ className, children, ...props }: Omit<ProgressBarProps, "children" | "className"> & {
    children?: React.ReactNode;
    className?: string;
}): React.JSX.Element;
declare function ProgressTrack({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element;
declare function ProgressIndicator({ className, style, ...props }: React.ComponentProps<"span">): React.JSX.Element;
declare function ProgressLabel({ className, ...props }: LabelProps): React.JSX.Element;
declare function ProgressValue({ className, children, ...props }: Omit<React.ComponentProps<"span">, "children"> & {
    children?: (value: string) => React.ReactNode;
}): React.JSX.Element;

export { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue };
