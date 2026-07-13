/**
 * Reads Set-Cookie values from response headers.
 * Prefer `getSetCookie()` when available; otherwise split a combined header on comma boundaries
 * that precede a cookie name (heuristic for environments without getSetCookie).
 */
export declare function readSetCookiesFromHeaders(sourceHeaders: Headers): string[];
export declare function mergeSetCookieHeaders(targetHeaders: Headers, sourceHeaders: Headers): void;
/** Merge pending Set-Cookie values into a Cookie header for same-request session reads. */
export declare function cookieHeaderWithSetCookies(requestCookie: string | null, setCookieSource: Headers): string | undefined;
/** Request headers with merged Set-Cookie from the session response accumulator. */
export declare function authHeadersForRequest(request: Request, responseHeaders: Headers, cookieHeader: string | null): Headers;
