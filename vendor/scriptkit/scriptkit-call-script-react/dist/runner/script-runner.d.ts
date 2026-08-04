import { type MergeTagContext, type RoutingAnswer, type ScriptDocument } from "@chester-hill-solutions/scriptkit-call-script-core";
export type ScriptRunnerProps = {
    document: ScriptDocument;
    mergeContext?: MergeTagContext;
    onComplete?: (answers: RoutingAnswer[]) => void;
    readOnly?: boolean;
};
export declare function ScriptRunner({ document, mergeContext, onComplete, readOnly, }: ScriptRunnerProps): import("react").JSX.Element;
