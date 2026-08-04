import { type MiddlewareFunction, type RouterContextProvider } from "react-router";
import type { AuthUser, RedirectOptions, SessionReader } from "@chester-hill-solutions/auth";
export type LoginUrlWithContinue = (request: Request, options?: RedirectOptions) => string;
export type RequireSessionOptions = {
    getSessionUserId: SessionReader["getSessionUserId"];
    loginUrlWithContinue: LoginUrlWithContinue;
};
export type AuthLayoutLoaderOptions = {
    getSessionUser: SessionReader["getSessionUser"];
    loginUrlWithContinue: LoginUrlWithContinue;
    onAuthenticatedUser?: (user: AuthUser) => void | Promise<void>;
};
export type AuthMiddlewareOptions = {
    getSessionUser: SessionReader["getSessionUser"];
    loginUrlWithContinue: LoginUrlWithContinue;
};
export type AuthLayoutMiddlewareOptions = AuthMiddlewareOptions;
export type AuthLayoutLoaderData = {
    user: AuthUser;
};
export type AuthLayoutLoaderArgs = {
    request: Request;
    /** Normalized location from React Router (present with v8_passThroughRequests / v8). */
    url?: URL;
};
/** Authenticated user for the current request (set by auth middleware). */
export declare const authUserContext: import("react-router").RouterContext<AuthUser>;
/** Session refresh headers from the auth middleware session read. */
export declare const authSessionHeadersContext: import("react-router").RouterContext<Headers>;
export type AuthContextReader = Pick<RouterContextProvider, "get">;
export declare function getAuthUserFromContext(context: AuthContextReader): AuthUser;
export declare function getAuthUserIdFromContext(context: AuthContextReader): AuthUser["id"];
export declare function createAuthMiddleware(options: AuthMiddlewareOptions): MiddlewareFunction<Response>;
/** Merge auth session Set-Cookie headers onto the final response (outermost middleware). */
export declare function createCommitAuthSessionHeadersMiddleware(): MiddlewareFunction<Response>;
/**
 * Preset middleware stack for authenticated layouts: commit session headers (outermost), then auth gate.
 * Order is invariant — do not reverse.
 */
export declare function createAuthLayoutMiddleware(options: AuthLayoutMiddlewareOptions): MiddlewareFunction<Response>[];
export declare function createGetSessionUserIdOrNull(options: RequireSessionOptions): (request: Request, headers: Headers) => Promise<string | null>;
export declare function createRequireSessionUserId(options: RequireSessionOptions): (request: Request, headers: Headers, url?: URL) => Promise<string>;
/**
 * @deprecated Use `createAuthLayoutMiddleware` on the route layout instead of a layout loader gate.
 */
export declare function createAuthLayoutLoader(options: AuthLayoutLoaderOptions): ({ request, url }: AuthLayoutLoaderArgs) => Promise<import("react-router").UNSAFE_DataWithResponseInit<{
    user: AuthUser;
}>>;
export { createInviteCompletionLoader, createRequireCapability, type InviteCompletionLoaderOptions, type RequireCapabilityOptions, type ResolveAuthorizationActor, } from "./capability.js";
