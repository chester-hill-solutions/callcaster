import type { TwimlResponse } from "@/lib/twilio-twiml.server";
import { ivrGatherAttributes, type IvrOption } from "@/lib/ivr-gather.server";

/**
 * The shared IVR block flow. The outbound campaign route and the inbound
 * IVR route differ only in how they load the call and what a prompt renders to —
 * the gather/navigate shape is identical, so it lives here once.
 */

export type { IvrOption };

export type IvrScript = {
  pages: Record<string, { blocks: string[] }>;
};

/** The verbs a prompt can be written to: the response root or a `<Gather>`. */
export type AudioTarget = Pick<TwimlResponse, "play" | "say">;

export type IvrBlock = {
  options?: IvrOption[];
  gatherTimeoutSeconds?: number;
  noInput?: IvrNoInputConfig;
};

export type IvrNoInputConfig = {
  action:
    | "next"
    | "hangup"
    | "replay"
    | { pageId: string; blockId: string };
  maxReplays?: number;
};

export const DEFAULT_NO_INPUT_MAX_REPLAYS = 2;

export type NoInputTarget =
  | { kind: "next" }
  | { kind: "hangup" }
  | { kind: "replay" }
  | { kind: "route"; pageId: string; blockId: string };

/**
 * The target after a caller gives no input, given how many times this step
 * has already replayed. Replay is capped: past `maxReplays`, fall through.
 */
export function resolveNoInputTarget(
  config: IvrNoInputConfig | undefined,
  replays: number,
): NoInputTarget {
  if (!config || config.action === "next") return { kind: "next" };
  if (config.action === "hangup") return { kind: "hangup" };
  if (config.action === "replay") {
    const max = Math.max(1, config.maxReplays ?? DEFAULT_NO_INPUT_MAX_REPLAYS);
    return replays >= max ? { kind: "next" } : { kind: "replay" };
  }
  return { kind: "route", pageId: config.action.pageId, blockId: config.action.blockId };
}

/** The block after the current one: the next block in the page, else the next page's first block. */
export function findNextBlock(
  script: IvrScript,
  currentPageId: string,
  currentBlockId: string,
): { pageId: string; blockId: string } | null {
  const currentPage = script.pages[currentPageId];
  if (!currentPage) {
    return null;
  }
  const currentBlockIndex = currentPage.blocks.indexOf(currentBlockId);

  if (currentBlockIndex < currentPage.blocks.length - 1) {
    const nextBlockId = currentPage.blocks[currentBlockIndex + 1];
    if (!nextBlockId) {
      return null;
    }
    return { pageId: currentPageId, blockId: nextBlockId };
  }

  const pageIds = Object.keys(script.pages);
  const currentPageIndex = pageIds.indexOf(currentPageId);
  if (currentPageIndex < pageIds.length - 1) {
    const nextPageId = pageIds[currentPageIndex + 1];
    const nextPage = nextPageId ? script.pages[nextPageId] : undefined;
    const nextBlockId = nextPage?.blocks[0];
    if (!nextPageId || !nextBlockId) {
      return null;
    }
    return { pageId: nextPageId, blockId: nextBlockId };
  }

  return null;
}

/**
 * Append one block to the response: a `<Gather>` with the prompt nested inside
 * when the block maps responses, otherwise the prompt then a redirect to
 * the next block, or hangup at the end of the script.
 */
export async function appendBlockResponse<B extends IvrBlock>(args: {
  twiml: TwimlResponse;
  block: B;
  pageId: string;
  blockId: string;
  script: IvrScript;
  buildActionUrl: (pageId: string, blockId: string) => string;
  buildBlockUrl: (pageId: string, blockId: string) => string;
  renderAudio: (target: AudioTarget, block: B) => Promise<void>;
}): Promise<void> {
  const {
    twiml,
    block,
    pageId,
    blockId,
    script,
    buildActionUrl,
    buildBlockUrl,
    renderAudio,
  } = args;

  if (block.options && block.options.length > 0) {
    const action = buildActionUrl(pageId, blockId);
    const gather = twiml.gather({
      action,
      ...ivrGatherAttributes(block.options, {
        timeoutSeconds: block.gatherTimeoutSeconds,
      }),
    });
    await renderAudio(gather, block);
    twiml.redirect(action);
    return;
  }

  await renderAudio(twiml, block);
  const next = findNextBlock(script, pageId, blockId);
  if (next) {
    twiml.redirect(buildBlockUrl(next.pageId, next.blockId));
  } else {
    twiml.hangup();
  }
}
