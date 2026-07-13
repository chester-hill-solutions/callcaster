import { createContext, data, redirect, } from "react-router";
import { mergeSetCookieHeaders } from "@chester-hill-solutions/auth/cookies";
/** Authenticated user for the current request (set by auth middleware). */
export const authUserContext = createContext();
/** Session refresh headers from the auth middleware session read. */
export const authSessionHeadersContext = createContext();
function mergeSessionHeaders(target, sessionHeaders) {
    mergeSetCookieHeaders(target, sessionHeaders);
}
export function getAuthUserFromContext(context) {
    return context.get(authUserContext);
}
export function getAuthUserIdFromContext(context) {
    return context.get(authUserContext).id;
}
export function createAuthMiddleware(options) {
    return async function authMiddleware({ request, url, context }) {
        const { user, headers: sessionHeaders } = await options.getSessionUser(request);
        context.set(authSessionHeadersContext, sessionHeaders);
        if (!user) {
            throw redirect(options.loginUrlWithContinue(request, { url }), { headers: sessionHeaders });
        }
        context.set(authUserContext, user);
    };
}
function getSessionHeadersFromContext(context) {
    try {
        return context.get(authSessionHeadersContext);
    }
    catch (error) {
        if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
            throw new Error("authSessionHeadersContext is missing. Stack createCommitAuthSessionHeadersMiddleware outermost, then createAuthMiddleware.", { cause: error });
        }
        return null;
    }
}
function assertMiddlewareResponse(value) {
    if (value instanceof Response) {
        return value;
    }
    throw new Error("Auth middleware expected downstream handlers to return a Response.");
}
/** Merge auth session Set-Cookie headers onto the final response (outermost middleware). */
export function createCommitAuthSessionHeadersMiddleware() {
    return async function commitAuthSessionHeadersMiddleware({ context }, next) {
        const response = assertMiddlewareResponse(await next());
        const sessionHeaders = getSessionHeadersFromContext(context);
        if (!sessionHeaders) {
            return response;
        }
        const headers = new Headers(response.headers);
        mergeSessionHeaders(headers, sessionHeaders);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    };
}
/**
 * Preset middleware stack for authenticated layouts: commit session headers (outermost), then auth gate.
 * Order is invariant — do not reverse.
 */
export function createAuthLayoutMiddleware(options) {
    return [createCommitAuthSessionHeadersMiddleware(), createAuthMiddleware(options)];
}
export function createGetSessionUserIdOrNull(options) {
    return async function getSessionUserIdOrNull(request, headers) {
        const { userId, headers: sessionHeaders } = await options.getSessionUserId(request);
        mergeSessionHeaders(headers, sessionHeaders);
        return userId;
    };
}
export function createRequireSessionUserId(options) {
    const getSessionUserIdOrNull = createGetSessionUserIdOrNull(options);
    return async function requireSessionUserId(request, headers, url) {
        const userId = await getSessionUserIdOrNull(request, headers);
        if (!userId)
            throw redirect(options.loginUrlWithContinue(request, { url }), { headers });
        return userId;
    };
}
/**
 * @deprecated Use `createAuthLayoutMiddleware` on the route layout instead of a layout loader gate.
 */
export function createAuthLayoutLoader(options) {
    return async function authLayoutLoader({ request, url }) {
        const headers = new Headers();
        const { user, headers: sessionHeaders } = await options.getSessionUser(request);
        mergeSessionHeaders(headers, sessionHeaders);
        if (!user) {
            throw redirect(options.loginUrlWithContinue(request, { url }), { headers });
        }
        if (options.onAuthenticatedUser) {
            await options.onAuthenticatedUser(user);
        }
        return data({ user }, { headers });
    };
}
export { createInviteCompletionLoader, createRequireCapability, } from "./capability.js";
