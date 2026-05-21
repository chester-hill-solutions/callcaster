/** Normalize RR7 loader/action return values in route unit tests. */
function statusFromInit(init: number | { status?: number; headers?: Headers } | null | undefined): number {
  if (typeof init === "number") return init;
  if (init && typeof init === "object" && "status" in init) {
    return init.status ?? 200;
  }
  return 200;
}

function headersFromInit(
  init: number | { status?: number; headers?: Headers | Record<string, string> } | null | undefined,
): Headers {
  if (init && typeof init === "object" && "headers" in init && init.headers) {
    if (init.headers instanceof Headers) {
      return init.headers;
    }
    return new Headers(init.headers);
  }
  return new Headers();
}

export async function normalizeRouteResult(result: unknown): Promise<{
  status: number;
  body: unknown;
  headers: Headers;
}> {
  if (result instanceof Response) {
    const contentType = result.headers.get("Content-Type") ?? "";
    if (
      contentType.includes("text/csv") ||
      contentType.includes("octet-stream") ||
      contentType.includes("application/octet-stream")
    ) {
      const buffer = await result.arrayBuffer();
      return { status: result.status, body: buffer, headers: result.headers };
    }

    const text = await result.text();
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

type RouteResponseShape = {
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

/** Response-shaped wrapper so existing route tests can keep `res.status` / `res.json()`. */
export async function asRouteResponse(
  result: unknown,
): Promise<RouteResponseShape & Record<string, unknown>> {
  const { status, body, headers } = await normalizeRouteResult(result);
  const response: RouteResponseShape = {
    status,
    headers,
    json: async () => body,
    text: async () => {
      if (body === undefined || body === null) return "";
      if (body instanceof ArrayBuffer) {
        return new TextDecoder().decode(body);
      }
      if (body instanceof Uint8Array) {
        return new TextDecoder().decode(body);
      }
      return typeof body === "string" ? body : JSON.stringify(body);
    },
    arrayBuffer: async () => {
      if (body instanceof ArrayBuffer) return body;
      if (body instanceof Uint8Array) {
        return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      }
      const text =
        body === undefined || body === null
          ? ""
          : typeof body === "string"
            ? body
            : JSON.stringify(body);
      return new TextEncoder().encode(text).buffer;
    },
  };

  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    return { ...(body as Record<string, unknown>), ...response };
  }

  return response;
}
