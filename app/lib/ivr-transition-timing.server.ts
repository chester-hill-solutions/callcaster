const RESPONSE_READY_AT_PARAM = "ivr_response_ready_at";
const SOURCE_PAGE_ID_PARAM = "ivr_source_page_id";
const SOURCE_BLOCK_ID_PARAM = "ivr_source_block_id";

export type IvrTransitionSource = {
  responseReadyAtMs: number;
  pageId: string;
  blockId: string;
};

export type IvrTransitionLogFields = {
  sourcePageId: string | null;
  sourceBlockId: string | null;
  responseToNextBlockMs: number | null;
};

export function addIvrTransitionSource(
  targetUrl: string,
  source: IvrTransitionSource,
): string {
  const url = new URL(targetUrl);
  url.searchParams.set(RESPONSE_READY_AT_PARAM, String(source.responseReadyAtMs));
  url.searchParams.set(SOURCE_PAGE_ID_PARAM, source.pageId);
  url.searchParams.set(SOURCE_BLOCK_ID_PARAM, source.blockId);
  return url.toString();
}

export function readIvrTransitionSource(
  requestUrl: string,
  requestReceivedAtMs = Date.now(),
): (IvrTransitionSource & { responseToNextBlockMs: number }) | null {
  const params = new URL(requestUrl).searchParams;
  const responseReadyAtMs = Number(params.get(RESPONSE_READY_AT_PARAM));
  const pageId = params.get(SOURCE_PAGE_ID_PARAM);
  const blockId = params.get(SOURCE_BLOCK_ID_PARAM);

  if (
    !Number.isSafeInteger(responseReadyAtMs) ||
    responseReadyAtMs < 0 ||
    responseReadyAtMs > requestReceivedAtMs ||
    !pageId ||
    !blockId
  ) {
    return null;
  }

  return {
    responseReadyAtMs,
    pageId,
    blockId,
    responseToNextBlockMs: requestReceivedAtMs - responseReadyAtMs,
  };
}

export function getIvrTransitionLogFields(
  source: (IvrTransitionSource & { responseToNextBlockMs: number }) | null,
): IvrTransitionLogFields {
  if (!source) {
    return {
      sourcePageId: null,
      sourceBlockId: null,
      responseToNextBlockMs: null,
    };
  }

  return {
    sourcePageId: source.pageId,
    sourceBlockId: source.blockId,
    responseToNextBlockMs: source.responseToNextBlockMs,
  };
}
