import type { BlockedPathOptions, RedirectOptions } from "./types.js";
/**
 * Returns a same-origin path+search safe to use after login, or null.
 * Rejects open redirects, protocol-relative paths, and blocked sign-in targets.
 */
export declare function safePostLoginRedirectPath(request: Request, raw: string | null | undefined, options?: BlockedPathOptions): string | null;
/** Current request path+search, for building a login URL (trusted: same request). */
export declare function requestPathAndSearch(request: Request, url?: URL): string;
export declare function loginUrlWithContinue(request: Request, options?: RedirectOptions): string;
