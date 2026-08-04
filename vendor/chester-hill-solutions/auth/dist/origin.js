/**
 * Public app origin for auth baseURL, email CTA links, and redirect validation.
 * On Railway, `RAILWAY_PUBLIC_DOMAIN` is the hostname only (no scheme).
 */
export function appPublicOrigin() {
    const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (railway) {
        if (/^https?:\/\//i.test(railway))
            return railway.replace(/\/$/, "");
        return `https://${railway.replace(/\/$/, "")}`;
    }
    const fromApp = process.env.APP_PUBLIC_ORIGIN?.trim();
    if (fromApp)
        return fromApp.replace(/\/$/, "");
    return "";
}
/** Origins auth may redirect to (public origin + `APP_TRUSTED_ORIGINS`). */
export function authTrustedOrigins(fallback = "http://localhost:5173") {
    const fromEnv = (process.env.APP_TRUSTED_ORIGINS ?? fallback)
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const publicOrigin = appPublicOrigin();
    const merged = publicOrigin ? [publicOrigin, ...fromEnv] : fromEnv;
    return [...new Set(merged)];
}
/** Same-origin absolute URL for auth callbacks and email redirectTo (must match trusted origins). */
export function absoluteAppUrl(request, pathname) {
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const origin = appPublicOrigin() || new URL(request.url).origin;
    return new URL(path, origin).href;
}
