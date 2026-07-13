/**
 * Public app origin for auth baseURL, email CTA links, and redirect validation.
 * On Railway, `RAILWAY_PUBLIC_DOMAIN` is the hostname only (no scheme).
 */
export declare function appPublicOrigin(): string;
/** Origins auth may redirect to (public origin + `APP_TRUSTED_ORIGINS`). */
export declare function authTrustedOrigins(fallback?: string): string[];
/** Same-origin absolute URL for auth callbacks and email redirectTo (must match trusted origins). */
export declare function absoluteAppUrl(request: Request, pathname: string): string;
