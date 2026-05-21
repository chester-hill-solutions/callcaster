/** Normalize RR7 loader/action return values in route unit tests. */
export async function normalizeRouteResult(result: unknown): Promise<{
  status: number;
  body: unknown;
}> {
  if (result instanceof Response) {
    let body: unknown = null;
    try {
      body = await result.json();
    } catch {
      body = await result.text();
    }
    return { status: result.status, body };
  }

  if (
    result &&
    typeof result === "object" &&
    "data" in result &&
    ("init" in result || "type" in result)
  ) {
    const wrapped = result as {
      data: unknown;
      init?: number | { status?: number } | null;
    };
    const init = wrapped.init;
    const status =
      typeof init === "number"
        ? init
        : init && typeof init === "object" && "status" in init
          ? (init.status ?? 200)
          : 200;
    return { status, body: wrapped.data };
  }

  return { status: 200, body: result };
}

/** Response-shaped wrapper so existing route tests can keep `res.status` / `res.json()`. */
export async function asRouteResponse(result: unknown): Promise<{
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}> {
  const { status, body } = await normalizeRouteResult(result);
  return {
    status,
    json: async () => body,
    text: async () =>
      typeof body === "string" ? body : JSON.stringify(body ?? ""),
  };
}
