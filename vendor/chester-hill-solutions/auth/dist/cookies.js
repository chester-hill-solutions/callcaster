import { parse, serialize } from "cookie";
/**
 * Reads Set-Cookie values from response headers.
 * Prefer `getSetCookie()` when available; otherwise split a combined header on comma boundaries
 * that precede a cookie name (heuristic for environments without getSetCookie).
 */
export function readSetCookiesFromHeaders(sourceHeaders) {
    const getSetCookie = sourceHeaders.getSetCookie?.bind(sourceHeaders);
    if (getSetCookie)
        return getSetCookie();
    const raw = sourceHeaders.get("set-cookie");
    if (!raw)
        return [];
    return splitCombinedSetCookieHeader(raw);
}
/** Split combined Set-Cookie header on commas before cookie-name= (not Expires= date commas). */
function splitCombinedSetCookieHeader(raw) {
    const parts = [];
    let start = 0;
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] !== ",")
            continue;
        const rest = raw.slice(i + 1);
        const match = /^\s*[^=\s;]+=/.exec(rest);
        if (!match)
            continue;
        parts.push(raw.slice(start, i).trim());
        start = i + 1;
        i += match.index ?? 0;
    }
    const tail = raw.slice(start).trim();
    if (tail)
        parts.push(tail);
    return parts;
}
export function mergeSetCookieHeaders(targetHeaders, sourceHeaders) {
    for (const setCookie of readSetCookiesFromHeaders(sourceHeaders)) {
        targetHeaders.append("Set-Cookie", setCookie);
    }
}
/** Merge pending Set-Cookie values into a Cookie header for same-request session reads. */
export function cookieHeaderWithSetCookies(requestCookie, setCookieSource) {
    const jar = parse(requestCookie ?? "");
    for (const setCookie of readSetCookiesFromHeaders(setCookieSource)) {
        const pair = setCookie.split(";")[0]?.trim();
        if (!pair)
            continue;
        const eq = pair.indexOf("=");
        if (eq <= 0)
            continue;
        jar[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    const parts = Object.entries(jar)
        .filter((entry) => entry[1] !== undefined)
        .map(([name, value]) => serialize(name, value));
    return parts.length > 0 ? parts.join("; ") : undefined;
}
/** Request headers with merged Set-Cookie from the session response accumulator. */
export function authHeadersForRequest(request, responseHeaders, cookieHeader) {
    const h = new Headers(request.headers);
    const mergedCookie = cookieHeaderWithSetCookies(cookieHeader, responseHeaders);
    if (mergedCookie)
        h.set("Cookie", mergedCookie);
    return h;
}
