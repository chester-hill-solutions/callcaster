import * as React from 'react';
import { VariantProps } from 'class-variance-authority';
import { ToggleButtonGroupProps, ToggleButtonProps } from 'react-aria-components';
import { toggleVariants } from './toggle.js';
import 'class-variance-authority/types';

declare function ToggleGroup({ className, variant, size, spacing, orientation, children, ...props }: Omit<ToggleButtonGroupProps, "children"> & VariantProps<typeof toggleVariants> & {
    spacing?: number;
    orientation?: "horizontal" | "vertical";
    children?: React.ReactNode;
}): React.JSX.Element;
declare function ToggleGroupItem({ className, children, variant, size, ...props }: ToggleButtonProps & VariantProps<typeof toggleVariants>): React.JSX.Element;

export { ToggleGroup, ToggleGroupItem };
