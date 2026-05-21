/** Normalize RR7 loader/action return values in route unit tests. */
function statusFromInit(init: number | { status?: number; headers?: Headers } | null | undefined): number {
  if (typeof init === "number") return init;
  if (init && typeof init === "object" && "status" in init) {
    return init.status ?? 200;
  }
  return 200;
}

function headersFromInit(
  init: number | { status?: number; headers?: Headers } | null | undefined,
): Headers {
  if (init && typeof init === "object" && "headers" in init && init.headers) {
    return init.headers;
  }
  return new Headers();
}

export async function normalizeRouteResult(result: unknown): Promise<{
  status: number;
  body: unknown;
  headers: Headers;
}> {
  if (result instanceof Response) {
    const text = await result.text();
    const contentType = result.headers.get("Content-Type") ?? "";
    let body: unknown = text;
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: result.status, body, headers: result.headers };
  }

  if (
    result &&
    typeof result === "object" &&
    "data" in result &&
    ("init" in result || "type" in result)
  ) {
    const wrapped = result as {
      data: unknown;
      init?: number | { status?: number; headers?: Headers } | null;
    };
    const init = wrapped.init;
    return {
      status: statusFromInit(init),
      body: wrapped.data,
      headers: headersFromInit(init),
    };
  }

  return { status: 200, body: result, headers: new Headers() };
}

/** Response-shaped wrapper so existing route tests can keep `res.status` / `res.json()`. */
export async function asRouteResponse(result: unknown): Promise<{
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}> {
  const { status, body, headers } = await normalizeRouteResult(result);
  return {
    status,
    headers,
    json: async () => body,
    text: async () =>
      typeof body === "string" ? body : JSON.stringify(body ?? ""),
  };
}
