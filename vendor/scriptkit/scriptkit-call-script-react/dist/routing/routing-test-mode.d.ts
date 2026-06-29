import { type ScriptDocument } from "@chester-hill-solutions/scriptkit-call-script-core";
declare const scripts: import("@chester-hill-solutions/scriptkit-call-script-core").CallScriptService;
export type RoutingTestModeProps = {
    document: ScriptDocument;
};
export declare function RoutingTestMode({ document }: RoutingTestModeProps): import("react").JSX.Element;
export type RoutingFlowPreviewProps = {
    routing: ReturnType<typeof scripts.evaluateRouting>;
};
export declare function RoutingFlowPreview({ routing }: RoutingFlowPreviewProps): import("react").JSX.Element;
export {};
