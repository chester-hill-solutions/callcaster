import { useMemo, useState } from "react";
import {
  createCallScriptService,
  type RoutingAnswer,
  type ScriptBlock,
  type ScriptDocument,
} from "@chester-hill-solutions/scriptkit-call-script-core";
import { useCallScriptUi } from "../context.js";

const scripts = createCallScriptService();

export type RoutingTestModeProps = {
  document: ScriptDocument;
};

export function RoutingTestMode({ document }: RoutingTestModeProps) {
  const ui = useCallScriptUi();
  const [answers, setAnswers] = useState<RoutingAnswer[]>([]);
  const routing = useMemo(() => scripts.evaluateRouting(document, answers), [document, answers]);

  return (
    <div className="call-script-root">
      <p className="call-script-muted">Routing test — simulate answers</p>
      {Object.values(document.blocks).map((block: ScriptBlock) => {
        if (block.type === "instruction") {
          return null;
        }
        const value = answers.find((a) => a.blockId === block.id)?.value ?? "";
        return (
          <ui.Field key={block.id} label={`${block.type}: ${block.id}`}>
            <ui.Input
              value={value}
              onChange={(next) => {
                setAnswers((prev) => [
                  ...prev.filter((a) => a.blockId !== block.id),
                  { blockId: block.id, value: next },
                ]);
              }}
            />
          </ui.Field>
        );
      })}
      <RoutingFlowPreview routing={routing} />
    </div>
  );
}

export type RoutingFlowPreviewProps = {
  routing: ReturnType<typeof scripts.evaluateRouting>;
};

export function RoutingFlowPreview({ routing }: RoutingFlowPreviewProps) {
  return (
    <pre className="call-script-muted" style={{ whiteSpace: "pre-wrap" }}>
      {JSON.stringify(routing, null, 2)}
    </pre>
  );
}
