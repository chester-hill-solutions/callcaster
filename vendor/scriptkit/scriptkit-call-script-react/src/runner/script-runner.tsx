import { useMemo, useState } from "react";
import {
  createCallScriptService,
  type MergeTagContext,
  type RoutingAnswer,
  type ScriptDocument,
} from "@chester-hill-solutions/scriptkit-call-script-core";
import { useCallScriptUi } from "../context.js";

const scripts = createCallScriptService();

export type ScriptRunnerProps = {
  document: ScriptDocument;
  mergeContext?: MergeTagContext;
  onComplete?: (answers: RoutingAnswer[]) => void;
  readOnly?: boolean;
};

export function ScriptRunner({
  document,
  mergeContext = {},
  onComplete,
  readOnly = false,
}: ScriptRunnerProps) {
  const ui = useCallScriptUi();
  const [answers, setAnswers] = useState<RoutingAnswer[]>([]);

  const routing = useMemo(
    () => scripts.evaluateRouting(document, answers),
    [document, answers],
  );

  const currentBlockId = routing.nextBlockId;
  const currentBlock = currentBlockId ? document.blocks[currentBlockId] : null;
  const currentAnswer = answers.find((a) => a.blockId === currentBlockId)?.value ?? "";

  const setAnswer = (value: string) => {
    if (!currentBlockId) {
      return;
    }
    setAnswers((prev) => {
      const rest = prev.filter((a) => a.blockId !== currentBlockId);
      const next = [...rest, { blockId: currentBlockId, value }];
      const result = scripts.evaluateRouting(document, next);
      if (result.complete) {
        onComplete?.(next);
      }
      return next;
    });
  };

  if (routing.complete) {
    return (
      <div className="call-script-root call-script-runner">
        <p>Script complete.</p>
      </div>
    );
  }

  if (!currentBlock) {
    return (
      <div className="call-script-root call-script-runner">
        <p className="call-script-muted">No block to display.</p>
      </div>
    );
  }

  const prompt =
    "prompt" in currentBlock
      ? scripts.applyMergeTags(currentBlock.prompt ?? "", mergeContext)
      : "";
  const body =
    currentBlock.type === "instruction"
      ? scripts.applyMergeTags(currentBlock.body, mergeContext)
      : "";

  return (
    <div className="call-script-root call-script-runner">
      {body && <p>{body}</p>}
      {currentBlock.type === "instruction" && (
        <ui.Button onClick={() => setAnswer("__continue__")} disabled={readOnly}>
          Continue
        </ui.Button>
      )}
      {currentBlock.type === "yes_no" && (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <ui.Button onClick={() => setAnswer("yes")} disabled={readOnly}>
            Yes
          </ui.Button>
          <ui.Button onClick={() => setAnswer("no")} disabled={readOnly}>
            No
          </ui.Button>
        </div>
      )}
      {(currentBlock.type === "text" || currentBlock.type === "textarea") && (
        <ui.Field label={prompt || "Response"}>
          <ui.Textarea value={currentAnswer} readOnly={readOnly} onChange={setAnswer} />
        </ui.Field>
      )}
      {(currentBlock.type === "choice" ||
        currentBlock.type === "select" ||
        currentBlock.type === "radio") && (
        <ui.Field label={prompt || "Choose"}>
          <ui.Select
            value={currentAnswer}
            readOnly={readOnly}
            options={currentBlock.options ?? []}
            onChange={setAnswer}
          />
        </ui.Field>
      )}
      {currentBlock.type === "support" && (
        <ui.Field label={prompt || "Notes"}>
          <ui.Textarea value={currentAnswer} readOnly={readOnly} onChange={setAnswer} />
        </ui.Field>
      )}
    </div>
  );
}
