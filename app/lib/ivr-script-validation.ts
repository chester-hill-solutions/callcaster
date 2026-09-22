/**
 * IVR script routing validation (#1884): catches option `next` targets that
 * dangle (reference a missing page/block) and routing cycles that never reach
 * a terminal (`hangup`/`end`).
 *
 * Operates on the editor document shape (`ScriptDocument`: pages → blockIds,
 * blocks → options[].next) so it is client-safe (surfaced in the script
 * editor) and server-shared (launch gate via `validateScriptSteps`).
 */

import type { ScriptDocument } from "@chester-hill-solutions/scriptkit-call-script-core";

export type IvrRoutingIssue =
  | {
      kind: "dangling";
      sourceBlock: string;
      target: string;
      error: string;
    }
  | { kind: "cycle"; blockId: string; error: string };

export type IvrRoutingValidation = {
  ok: boolean;
  issues: IvrRoutingIssue[];
};

export type IvrRoutingInput = Pick<
  ScriptDocument,
  "pages" | "blocks" | "startPageId"
>;

const TERMINAL_TARGETS = new Set(["hangup", "end"]);

type ResolvedTarget =
  | { kind: "terminal" }
  | { kind: "block"; pageId: string; blockId: string }
  | { kind: "invalid"; reason: string };

function resolveNext(
  next: string,
  currentPageId: string,
  document: IvrRoutingInput,
): ResolvedTarget {
  if (TERMINAL_TARGETS.has(next)) {
    return { kind: "terminal" };
  }

  if (next.includes(":")) {
    const [pageId, blockId] = next.split(":");
    if (!pageId || !blockId) {
      return { kind: "invalid", reason: `Malformed page:block target "${next}"` };
    }
    if (!document.pages[pageId]) {
      return { kind: "invalid", reason: `Routes to missing page "${pageId}"` };
    }
    if (!document.blocks[blockId]) {
      return { kind: "invalid", reason: `Routes to missing block "${blockId}"` };
    }
    return { kind: "block", pageId, blockId };
  }

  if (document.pages[next]) {
    const firstBlockId = document.pages[next].blockIds[0];
    if (!firstBlockId) {
      return {
        kind: "invalid",
        reason: `Routes to page "${next}", which has no steps`,
      };
    }
    return { kind: "block", pageId: next, blockId: firstBlockId };
  }

  if (document.blocks[next]) {
    return { kind: "block", pageId: currentPageId, blockId: next };
  }

  return { kind: "invalid", reason: `Routes to unknown target "${next}"` };
}

export function validateIvrRouting(
  document: IvrRoutingInput,
): IvrRoutingValidation {
  const issues: IvrRoutingIssue[] = [];
  const edges = new Map<string, Array<{ pageId: string; blockId: string }>>();

  for (const page of Object.values(document.pages)) {
    for (const blockId of page.blockIds) {
      const block = document.blocks[blockId];
      if (!block || !("options" in block) || !block.options) {
        continue;
      }
      for (const option of block.options) {
        if (!option.next) {
          continue;
        }
        const resolved = resolveNext(option.next, page.id, document);
        if (resolved.kind === "terminal") {
          continue;
        }
        if (resolved.kind === "invalid") {
          issues.push({
            kind: "dangling",
            sourceBlock: blockId,
            target: option.next,
            error: `Step "${blockId}" ${resolved.reason}`,
          });
          continue;
        }
        const targets = edges.get(blockId) ?? [];
        targets.push({ pageId: resolved.pageId, blockId: resolved.blockId });
        edges.set(blockId, targets);
      }
    }
  }

  // DFS over non-terminal edges: a block reached while it is still on the DFS
  // stack means a routing cycle with no way out — an infinite hang.
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (blockId: string) => {
    const current = state.get(blockId) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      issues.push({
        kind: "cycle",
        blockId,
        error: `Routing cycle detected: step "${blockId}" loops back on itself without reaching "Hang up" or "end"`,
      });
      return;
    }
    state.set(blockId, 1);
    for (const edge of edges.get(blockId) ?? []) {
      visit(edge.blockId);
    }
    state.set(blockId, 2);
  };
  for (const blockId of edges.keys()) {
    visit(blockId);
  }

  return { ok: issues.length === 0, issues };
}