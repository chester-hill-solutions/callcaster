import * as React from 'react';
import { DisclosureProps, DisclosurePanelProps, ButtonProps } from 'react-aria-components';

declare function Collapsible({ ...props }: DisclosureProps): React.JSX.Element;
declare function CollapsibleTrigger({ ...props }: ButtonProps): React.JSX.Element;
declare function CollapsibleContent({ ...props }: DisclosurePanelProps): React.JSX.Element;

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
