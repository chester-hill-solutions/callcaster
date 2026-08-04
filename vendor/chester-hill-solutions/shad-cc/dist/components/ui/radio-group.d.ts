import * as React from 'react';
import { RadioGroupProps, RadioProps } from 'react-aria-components';

declare function RadioGroup({ className, ...props }: RadioGroupProps): React.JSX.Element;
declare function RadioGroupItem({ className, children, ...props }: RadioProps): React.JSX.Element;

export { RadioGroup, RadioGroupItem };
