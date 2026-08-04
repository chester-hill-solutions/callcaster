import * as React from 'react';
import * as ResizablePrimitive from 'react-resizable-panels';

declare function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps): React.JSX.Element;
declare function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps): React.JSX.Element;
declare function ResizableHandle({ withHandle, className, ...props }: ResizablePrimitive.SeparatorProps & {
    withHandle?: boolean;
}): React.JSX.Element;

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
