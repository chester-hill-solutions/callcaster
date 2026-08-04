import * as React from 'react';
import { SwitchProps } from 'react-aria-components';

declare function Switch({ className, size, children, ...props }: SwitchProps & {
    size?: "sm" | "default";
}): React.JSX.Element;

export { Switch };
