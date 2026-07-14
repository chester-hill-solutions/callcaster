import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  requestId: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();
type RequestIdGlobal = typeof globalThis & {
  __callcasterRequestIdProvider?: () => string | undefined;
};
(globalThis as RequestIdGlobal).__callcasterRequestIdProvider = () =>
  requestContextStorage.getStore()?.requestId;

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function getRequestId(): string | undefined {
  return getRequestContext()?.requestId;
}

export function addRequestIdToJobParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const requestId = getRequestId();
  return requestId ? { ...params, requestId } : params;
}
