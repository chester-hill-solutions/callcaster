import {
  createCallScriptService,
  type ScriptDocument,
} from "@chester-hill-solutions/scriptkit-call-script-core";
import type { Script } from "@/lib/types";

const scripts = createCallScriptService();

function ensureBlockTitles(doc: ScriptDocument): ScriptDocument {
  let untitledCount = 0;
  const blocks = Object.fromEntries(
    Object.entries(doc.blocks).map(([id, block]) => {
      if (block.title !== undefined) {
        return [id, block];
      }
      untitledCount += 1;
      return [id, { ...block, title: `Block ${untitledCount}` }];
    }),
  );
  return untitledCount === 0 ? doc : { ...doc, blocks };
}

export function scriptToDocument(script: Script): ScriptDocument {
  const steps = script.steps ?? { pages: {}, blocks: {} };
  return ensureBlockTitles(scripts.migrateFromCallcasterFlow(steps));
}

export function documentToScript(script: Script, document: ScriptDocument): Script {
  return {
    ...script,
    steps: scripts.serializeToCallcasterFlow(document) as Script["steps"],
  };
}

export function validateScriptSteps(steps: unknown) {
  const document = scripts.migrateFromCallcasterFlow(steps ?? { pages: {}, blocks: {} });
  return scripts.validateDocument(document);
}

export { createCallScriptService, scripts };
