import { callcasterFlowSchema, type CallcasterFlow } from "@chester-hill-solutions/scriptkit-call-script-core";
import { scripts } from "@/lib/call-script-service";
import { parseInboundTerminalTarget, validateIvrRouting } from "@/lib/ivr-script-validation";
import { ivrNoInputSchema } from "@/lib/ivr-no-input";

function rawPageErrors(flow: CallcasterFlow) {
  const errors: string[] = [];
  const startPageId = flow.startPageId ?? flow.pageOrder?.[0] ?? Object.keys(flow.pages)[0];
  if (!startPageId || !flow.pages[startPageId]?.blocks?.length) {
    errors.push("The start page must exist and contain a step.");
  }
  for (const [pageId, page] of Object.entries(flow.pages)) {
    if (page.id !== undefined && page.id !== pageId) errors.push(`Page ${pageId} has a different ID.`);
    for (const blockId of page.blocks ?? []) {
      if (!flow.blocks[blockId]) errors.push(`Page ${pageId} references missing step ${blockId}.`);
    }
  }
  return errors;
}

function rawBlockErrors(blocks: CallcasterFlow["blocks"]) {
  const errors: string[] = [];
  for (const [blockId, block] of Object.entries(blocks)) {
    if (block.id !== undefined && block.id !== blockId) errors.push(`Step ${blockId} has a different ID.`);
    if (block.options !== undefined) {
      if (!Array.isArray(block.options)) {
        errors.push(`Step ${blockId} has invalid response options.`);
        continue;
      }
      for (const option of block.options) {
        if (!option || typeof option !== "object" || ("next" in option && option.next !== undefined &&
          (typeof option.next !== "string" || !option.next))) {
          errors.push(`Step ${blockId} has an invalid response target.`);
        }
      }
    }
  }
  return errors;
}

function rawNoInputErrors(flow: CallcasterFlow) {
  const errors: string[] = [];
  for (const [blockId, block] of Object.entries(flow.blocks)) {
    if (block.noInput === undefined) continue;
    const config = ivrNoInputSchema.safeParse(block.noInput);
    if (!config.success) {
      errors.push(`Step ${blockId} has an invalid no-input action.`);
      continue;
    }
    const action = config.data.action;
    if (typeof action === "string" || flow.pages[action.pageId]?.blocks?.includes(action.blockId)) continue;
    errors.push(`Step ${blockId} has an invalid no-input target.`);
  }
  return errors;
}

/** Activation validates raw wire data before migration can repair it. Draft saves may retain errors. */
export function validateInboundScriptSteps(steps: unknown) {
  const parsed = callcasterFlowSchema.safeParse(steps);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  const flow = parsed.data;
  const errors = [...rawPageErrors(flow), ...rawBlockErrors(flow.blocks), ...rawNoInputErrors(flow)];
  if (errors.length) return { ok: false as const, errors };
  try {
    const document = scripts.migrateFromCallcasterFlow(flow);
    const structural = scripts.validateDocument(document);
    if (!structural.ok) return structural;
    const routing = validateIvrRouting(document, { inbound: true });
    if (!routing.ok) return { ok: false as const, errors: routing.issues.map((issue) => issue.error) };
    const queueIds = new Set<number>();
    for (const block of Object.values(document.blocks)) {
      if (!("options" in block)) continue;
      for (const option of block.options ?? []) {
        const target = parseInboundTerminalTarget(option.next ?? "");
        if (target?.kind === "queue") queueIds.add(target.queueId);
      }
    }
    return { ok: true as const, document, queueIds: [...queueIds] };
  } catch {
    return { ok: false as const, errors: ["The menu contains invalid steps."] };
  }
}
