const DEFAULT_BLOCKED_PATHS = ["/", "/login"];
const DEFAULT_LOGIN_PATH = "/";
const DEFAULT_REDIRECT_PARAM = "redirectTo";
function normalizeBlockedPaths(blockedPaths) {
    return blockedPaths ?? DEFAULT_BLOCKED_PATHS;
}
function isBlockedPath(pathname, blockedPaths) {
    return blockedPaths.some((blocked) => pathname === blocked || pathname.startsWith(`${blocked}/`));
}
/**
 * Returns a same-origin path+search safe to use after login, or null.
 * Rejects open redirects, protocol-relative paths, and blocked sign-in targets.
 */
export function safePostLoginRedirectPath(request, raw, options) {
    if (raw == null)
        return null;
    const trimmed = raw.trim();
    if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//"))
        return null;
    if (trimmed.includes("\\"))
        return null;
    const blockedPaths = normalizeBlockedPaths(options?.blockedPaths);
    let pathname;
    let search;
    try {
        const base = new URL(request.url);
        const resolved = new URL(trimmed, base.origin);
        if (resolved.origin !== base.origin)
            return null;
        pathname = resolved.pathname;
        search = resolved.search;
    }
    catch {
        return null;
    }
    if (isBlockedPath(pathname, blockedPaths))
        return null;
    return `${pathname}${search}`;
}
/** Current request path+search, for building a login URL (trusted: same request). */
export function requestPathAndSearch(request, url) {
    const u = url ?? new URL(request.url);
    return `${u.pathname}${u.search}`;
}
export function loginUrlWithContinue(request, options) {
    const loginPath = options?.loginPath ?? DEFAULT_LOGIN_PATH;
    const redirectParam = options?.redirectParam ?? DEFAULT_REDIRECT_PARAM;
    const pathAndSearch = requestPathAndSearch(request, options?.url);
    const separator = loginPath.includes("?") ? "&" : "?";
    return `${loginPath}${separator}${redirectParam}=${encodeURIComponent(pathAndSearch)}`;
}
