import {
  createCallScriptService,
  type ScriptDocument,
  callcasterFlowSchema,
} from "@chester-hill-solutions/scriptkit-call-script-core";
import type { Script } from "@/lib/types";
import { validateIvrRouting } from "@/lib/ivr-script-validation";

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
  return ensureBlockTitles(script.type === "inbound_ivr"
    ? inboundEditorDocument(steps) : scripts.migrateFromCallcasterFlow(steps));
}

function inboundEditorDocument(steps: unknown): ScriptDocument {
  const flow = callcasterFlowSchema.parse(steps);
  const original = scripts.migrateFromCallcasterFlow(flow);
  const responseBlocks = new Set(Object.entries(original.blocks)
    .filter(([id, block]) => block.type === "instruction" && Array.isArray(flow.blocks[id]?.options))
    .map(([id]) => id));
  if (!responseBlocks.size) return original;
  // The editor instruction shape has no responses. Reuse choice normalization and retain the runtime wire type.
  const document = scripts.migrateFromCallcasterFlow({ ...flow,
    blocks: Object.fromEntries(Object.entries(flow.blocks).map(([id, block]) =>
      [id, responseBlocks.has(id) ? { ...block, type: "select" } : block],
    )),
  });
  for (const id of responseBlocks) {
    const previous = original.blocks[id];
    const block = document.blocks[id];
    if (previous?.type !== "instruction" || !block) {
      throw new Error("The inbound response step could not be normalized.");
    }
    document.blocks[id] = { ...block, callcasterType: previous.callcasterType,
      wireExtras: { ...block.wireExtras, body: previous.body } };
  }
  return document;
}

export function documentToScript(script: Script, document: ScriptDocument): Script {
  return {
    ...script,
    steps: scripts.serializeToCallcasterFlow(document) as Script["steps"],
  };
}

export function validateScriptSteps(steps: unknown) {
  // Migration repairs old editor data; launch must reject an explicitly broken entry first.
  if (steps && typeof steps === "object" && "startPageId" in steps && steps.startPageId !== undefined) {
    if (typeof steps.startPageId !== "string" || !("pages" in steps) || !steps.pages ||
      typeof steps.pages !== "object" || !Object.hasOwn(steps.pages, steps.startPageId)) {
      return { ok: false as const, errors: [`Start page "${String(steps.startPageId)}" does not exist`] };
    }
  }
  const document = scripts.migrateFromCallcasterFlow(steps ?? { pages: {}, blocks: {} });
  const structural = scripts.validateDocument(document);
  if (!structural.ok) {
    return structural;
  }
  const routing = validateIvrRouting(document);
  if (!routing.ok) {
    return {
      ok: false as const,
      errors: routing.issues.map((issue) => issue.error),
    };
  }
  return structural;
}

export { createCallScriptService, scripts };
