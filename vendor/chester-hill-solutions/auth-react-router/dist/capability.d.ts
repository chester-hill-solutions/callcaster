import type { AuthorizationActor, CapabilityId, RedirectOptions, SessionReader } from "@chester-hill-solutions/auth";
import { CapabilityDeniedError } from "@chester-hill-solutions/auth";
type LoginUrlWithContinue = (request: Request, options?: RedirectOptions) => string;
export type ResolveAuthorizationActor = (args: {
    request: Request;
    workspaceId: string;
    userId: string;
}) => Promise<AuthorizationActor | Response>;
export type RequireCapabilityOptions = {
    capabilityId: CapabilityId | string;
    resolveActor: ResolveAuthorizationActor;
    /** Map CapabilityDeniedError to a Response (default JSON 403). */
    onDenied?: (error: CapabilityDeniedError) => Response;
};
/**
 * Factory for route handlers that need a workspace capability after auth.
 * Call with `{ request, workspaceId, userId }` once the session/API-key user is known.
 */
export declare function createRequireCapability(options: RequireCapabilityOptions): (args: {
    request: Request;
    workspaceId: string;
    userId: string;
}) => Promise<AuthorizationActor | Response>;
export type InviteCompletionLoaderOptions = {
    getSessionUser: SessionReader["getSessionUser"];
    loginUrlWithContinue: LoginUrlWithContinue;
    /** Normalized invite email the token/row is bound to. */
    getInviteEmail: (args: {
        request: Request;
        url?: URL;
    }) => Promise<string | null>;
};
/**
 * Ensures the authenticated user has a verified email matching the invite.
 * Redirects anonymous users to login with continue; returns 403 on mismatch.
 */
export declare function createInviteCompletionLoader(options: InviteCompletionLoaderOptions): ({ request, url, }: {
    request: Request;
    url?: URL;
}) => Promise<import("react-router").UNSAFE_DataWithResponseInit<{
    error: string;
    user: import("@chester-hill-solutions/auth").AuthUser;
}> | import("react-router").UNSAFE_DataWithResponseInit<{
    user: import("@chester-hill-solutions/auth").AuthUser;
    inviteEmail: string;
}>>;
export {};
