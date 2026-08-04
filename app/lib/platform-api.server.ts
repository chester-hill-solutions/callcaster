import { data as routeData } from "react-router";

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

export function jsonError(
  message: string,
  status = 400,
  code?: string,
  headers?: HeadersInit,
): Response {
  return jsonResponse(
    code ? { error: message, code } : { error: message },
    status,
    headers,
  );
}

export function routeJsonError(
  message: string,
  status = 400,
  code?: string,
): ReturnType<typeof routeData> {
  return routeData(
    code ? { error: message, code } : { error: message },
    { status, headers: { "Content-Type": "application/json" } },
  );
}

export function isApiRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return true;
  }
  const accept = request.headers.get("Accept") ?? "";
  return accept.includes("application/json");
}

export function methodNotAllowed(allowed: string[]): Response {
  return jsonError(`Method not allowed. Allowed: ${allowed.join(", ")}`, 405);
}
