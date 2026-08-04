import {
  createCallScriptService,
  type ScriptDocument,
} from "@chester-hill-solutions/scriptkit-call-script-core";
import type { Script } from "@/lib/types";

const scripts = createCallScriptService();

export function scriptToDocument(script: Script): ScriptDocument {
  const steps = script.steps ?? { pages: {}, blocks: {} };
  return scripts.migrateFromCallcasterFlow(steps);
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
