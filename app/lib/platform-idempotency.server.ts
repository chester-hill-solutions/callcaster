type IdempotencyRecord = {
  status: number;
  body: string;
  headers: Record<string, string>;
  createdAt: number;
};

const store = new Map<string, IdempotencyRecord>();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeKey(raw: string | null): string | null {
  const key = raw?.trim();
  if (!key || key.length > 256) {
    return null;
  }
  return key;
}

export function readIdempotencyKey(request: Request): string | null {
  return normalizeKey(request.headers.get("Idempotency-Key"));
}

export function getIdempotentResponse(
  scope: string,
  key: string,
): Response | null {
  const record = store.get(`${scope}:${key}`);
  if (!record) {
    return null;
  }
  if (record.createdAt + DEFAULT_TTL_MS < Date.now()) {
    store.delete(`${scope}:${key}`);
    return null;
  }
  const headers = new Headers(record.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Idempotency-Replayed", "true");
  return new Response(record.body, { status: record.status, headers });
}

export function storeIdempotentResponse(
  scope: string,
  key: string,
  response: Response,
  body: unknown,
): void {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  store.set(`${scope}:${key}`, {
    status: response.status,
    body: JSON.stringify(body),
    headers,
    createdAt: Date.now(),
  });
}

export async function withIdempotency(
  request: Request,
  scope: string,
  handler: () => Promise<{ response: Response; body: unknown }>,
): Promise<Response> {
  const key = readIdempotencyKey(request);
  if (!key) {
    const result = await handler();
    return result.response;
  }

  const cached = getIdempotentResponse(scope, key);
  if (cached) {
    return cached;
  }

  const result = await handler();
  if (result.response.status >= 200 && result.response.status < 300) {
    storeIdempotentResponse(scope, key, result.response, result.body);
  }
  return result.response;
}

/** Test helper — clears in-memory idempotency store between tests. */
export function resetIdempotencyForTests(): void {
  store.clear();
}
