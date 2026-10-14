import * as ResizablePrimitive from "react-resizable-panels";
declare function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps): import("react").JSX.Element;
declare function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps): import("react").JSX.Element;
declare function ResizableHandle({ withHandle, className, ...props }: ResizablePrimitive.SeparatorProps & {
    withHandle?: boolean;
}): import("react").JSX.Element;
export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
